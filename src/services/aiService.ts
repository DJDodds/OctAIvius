/**
 * AI Service for Electron
 * Handles AI provider communication (Anthropic, OpenAI, Google Gemini)
 */

import { config } from "../config";
import { Logger } from "../utils/logger";
import { ChatMessage, FunctionCall } from "../types";
import OpenAI from "openai";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import axios from "axios";

export class AIService {
  private logger: Logger;
  private openaiClient: OpenAI | null = null;
  private anthropicApiKey: string | null = null;
  private openaiApiKey: string | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;
  private geminiModel: GenerativeModel | null = null;
  private geminiApiKey: string | null = null;
  private conversationHistory: ChatMessage[] = [];
  private maxHistoryLength: number = 20; // Keep last 20 messages

  constructor() {
    this.logger = new Logger("AIService");
    this.logger.info(
      "AI Service initialized with provider:",
      config.ai.provider
    );

    // Initialize API keys if available
    this.openaiApiKey = config.ai.apiKey || process.env.OPENAI_API_KEY || null;
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || null;
    this.geminiApiKey = process.env.GEMINI_API_KEY || null;

    // Debug logging for API key presence (without exposing the key)
    if (this.openaiApiKey) {
      this.logger.info(
        `🔑 OpenAI API key loaded (starts with: ${this.openaiApiKey.substring(
          0,
          10
        )}...)`
      );
      this.initializeOpenAI();
    } else {
      this.logger.info("⚠️ No OpenAI API key found");
    }

    if (this.anthropicApiKey) {
      this.logger.info(
        `🔑 Anthropic API key loaded (starts with: ${this.anthropicApiKey.substring(
          0,
          10
        )}...)`
      );
    } else {
      this.logger.info("⚠️ No Anthropic API key found");
    }

    if (this.geminiApiKey) {
      this.logger.info(
        `🔑 Gemini API key loaded (starts with: ${this.geminiApiKey.substring(
          0,
          10
        )}...)`
      );
      this.initializeGemini();
    } else {
      this.logger.info("⚠️ No Gemini API key found");
    }
  }

  /**
   * Initialize OpenAI client
   */
  private initializeOpenAI(): void {
    if (!this.openaiApiKey) return;

    try {
      this.openaiClient = new OpenAI({
        apiKey: this.openaiApiKey,
      });
      this.logger.info("✅ OpenAI client initialized");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        "❌ Failed to initialize OpenAI client:",
        new Error(errorMessage)
      );
    }
  }

  /**
   * Initialize Google Gemini client
   */
  private initializeGemini(): void {
    if (!this.geminiApiKey) return;

    try {
      this.geminiClient = new GoogleGenerativeAI(this.geminiApiKey);
      this.geminiModel = this.geminiClient.getGenerativeModel({
        model: "gemini-1.5-flash", // Free tier model
      });
      this.logger.info("✅ Gemini client initialized");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        "❌ Failed to initialize Gemini client:",
        new Error(errorMessage)
      );
    }
  }

  /**
   * Update API keys and reinitialize clients
   */
  async updateApiKeys(
    openaiKey?: string,
    anthropicKey?: string,
    geminiKey?: string
  ): Promise<void> {
    if (openaiKey) {
      this.openaiApiKey = openaiKey;
      this.logger.info("🔑 OpenAI API key updated");
      this.initializeOpenAI();
    }

    if (anthropicKey) {
      this.anthropicApiKey = anthropicKey;
      this.logger.info("🔑 Anthropic API key updated");
    }

    if (geminiKey) {
      this.geminiApiKey = geminiKey;
      this.logger.info("🔑 Gemini API key updated");
      this.initializeGemini();
    }

    this.logger.info("🔑 API keys update completed");
  }

  /**
   * Test basic internet connectivity
   */
  private async testInternetConnectivity(): Promise<boolean> {
    try {
      const response = await axios.get("https://api.openai.com/v1/models", {
        timeout: 5000,
        headers: {
          "User-Agent": "GVAIBot/1.0.0",
        },
      });
      return response.status === 401; // Should get 401 without API key, which means we can reach the API
    } catch (error: any) {
      if (error?.response?.status === 401) {
        return true; // 401 means we can reach the API, just need auth
      }
      this.logger.error(
        "❌ Internet connectivity test failed:",
        new Error(error?.message || "Unknown error")
      );
      return false;
    }
  }

  /**
   * Validate API key format
   */
  private validateApiKeyFormat(
    provider: "openai" | "anthropic",
    apiKey: string
  ): boolean {
    if (provider === "openai") {
      // OpenAI keys start with sk- and are about 51 characters long
      const isValidFormat = apiKey.startsWith("sk-") && apiKey.length >= 45;
      this.logger.info(
        `🔑 OpenAI API key format validation: ${
          isValidFormat ? "VALID" : "INVALID"
        } (length: ${apiKey.length})`
      );
      return isValidFormat;
    } else if (provider === "anthropic") {
      // Anthropic keys start with sk-ant-
      const isValidFormat = apiKey.startsWith("sk-ant-") && apiKey.length >= 45;
      this.logger.info(
        `🔑 Anthropic API key format validation: ${
          isValidFormat ? "VALID" : "INVALID"
        } (length: ${apiKey.length})`
      );
      return isValidFormat;
    }
    return false;
  }

  /**
   * Test connectivity with current API configuration
   */
  async testConnection(
    provider: "openai" | "anthropic" | "gemini" = "gemini"
  ): Promise<boolean> {
    try {
      // First test basic internet connectivity
      this.logger.info("🌐 Testing internet connectivity...");
      const hasInternet = await this.testInternetConnectivity();
      if (!hasInternet) {
        this.logger.error(
          "❌ No internet connection or unable to reach AI API"
        );
        return false;
      }
      this.logger.info("✅ Internet connectivity confirmed");

      if (provider === "gemini") {
        if (!this.geminiApiKey) {
          this.logger.error("❌ No Gemini API key configured");
          return false;
        }

        // Ensure client is initialized
        if (!this.geminiModel) {
          this.initializeGemini();
        }

        if (!this.geminiModel) {
          this.logger.error("❌ Failed to initialize Gemini client");
          return false;
        }

        // Test Gemini connection with a simple request
        this.logger.info("🔄 Testing Gemini connection...");
        this.logger.info(`🔧 Using model: gemini-1.5-flash (free tier)`);

        const result = await this.geminiModel.generateContent("Test");
        const response = await result.response;
        const text = response.text();

        const success = !!text;
        this.logger.info(
          success
            ? "✅ Gemini connection successful"
            : "❌ Gemini connection failed - no response"
        );
        return success;
      } else if (provider === "openai") {
        if (!this.openaiApiKey) {
          this.logger.error("❌ No OpenAI API key configured");
          return false;
        }

        // Ensure client is initialized
        if (!this.openaiClient) {
          this.initializeOpenAI();
        }

        if (!this.openaiClient) {
          this.logger.error("❌ Failed to initialize OpenAI client");
          return false;
        }

        // Test OpenAI connection with a simple request
        this.logger.info("🔄 Testing OpenAI connection...");
        this.logger.info(`🔧 Using model: gpt-3.5-turbo (forced for testing)`);

        const response = await this.openaiClient.chat.completions.create({
          model: "gpt-3.5-turbo", // Force gpt-3.5-turbo for testing
          messages: [{ role: "user", content: "Test" }],
          max_tokens: 5,
          temperature: 0,
        });

        const success = !!response.choices[0]?.message?.content;
        this.logger.info(
          success
            ? "✅ OpenAI connection successful"
            : "❌ OpenAI connection failed - no response"
        );
        return success;
      } else if (provider === "anthropic") {
        if (!this.anthropicApiKey) {
          this.logger.error("❌ No Anthropic API key configured");
          return false;
        }

        // Test Anthropic connection
        this.logger.info("🔄 Testing Anthropic connection...");
        const response = await axios.post(
          "https://api.anthropic.com/v1/messages",
          {
            model: "claude-3-haiku-20240307",
            max_tokens: 5,
            messages: [{ role: "user", content: "Test" }],
          },
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.anthropicApiKey,
              "anthropic-version": "2023-06-01",
            },
          }
        );

        const success = !!response.data?.content?.[0]?.text;
        this.logger.info(
          success
            ? "✅ Anthropic connection successful"
            : "❌ Anthropic connection failed - no response"
        );
        return success;
      }

      this.logger.error(`❌ Unknown provider: ${provider}`);
      return false;
    } catch (error: any) {
      // Log the complete error object for debugging
      this.logger.error(`❌ Raw error object:`, error);

      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        "Unknown error";

      this.logger.error(
        `❌ Connection test failed for ${provider}:`,
        new Error(errorMessage)
      );

      // Log more detailed error information for debugging
      if (error?.response?.status) {
        this.logger.error(`HTTP Status: ${error.response.status}`);
      }
      if (error?.response?.data) {
        this.logger.error(`Response data:`, error.response.data);
      }
      if (error?.code) {
        this.logger.error(`Error code: ${error.code}`);
      }

      // Provide user-friendly error messages
      if (
        errorMessage.includes("exceeded your current quota") ||
        errorMessage.includes("429") ||
        error?.status === 429
      ) {
        throw new Error(
          `❌ OpenAI Quota Issue: ${errorMessage}. Check your billing at https://platform.openai.com/account/billing`
        );
      } else if (
        errorMessage.includes("invalid_api_key") ||
        errorMessage.includes("401") ||
        error?.status === 401
      ) {
        throw new Error(
          "❌ Invalid API Key: Please check your OpenAI API key is correct."
        );
      } else if (errorMessage.includes("rate_limit")) {
        throw new Error(
          "❌ Rate Limited: Too many requests. Please wait a moment and try again."
        );
      } else if (
        errorMessage.includes("network") ||
        errorMessage.includes("timeout")
      ) {
        throw new Error(
          "❌ Network Error: Check your internet connection and try again."
        );
      } else {
        throw new Error(`❌ OpenAI Error: ${errorMessage}`);
      }
    }
  }

  /**
   * Process a chat message and get AI response
   */
  async processMessage(message: string): Promise<string> {
    this.logger.info(
      "Processing message with AI provider:",
      config.ai.provider
    );

    try {
      // Add user message to conversation history
      this.addToConversationHistory("user", message);

      // Check if we have API keys configured for any provider
      const hasOpenAI = this.openaiApiKey && this.openaiClient;
      const hasAnthropic = this.anthropicApiKey;
      const hasGemini = this.geminiApiKey && this.geminiModel;

      if (!hasOpenAI && !hasAnthropic && !hasGemini) {
        const mockResponse = this.getMockResponse(message);
        this.addToConversationHistory("assistant", mockResponse);
        return mockResponse;
      }

      // Use the configured provider, but fall back to available one
      let provider = config.ai.provider;
      if (provider === "openai" && !hasOpenAI && hasGemini) {
        provider = "gemini";
      } else if (provider === "openai" && !hasOpenAI && hasAnthropic) {
        provider = "anthropic";
      } else if (provider === "anthropic" && !hasAnthropic && hasGemini) {
        provider = "gemini";
      } else if (provider === "anthropic" && !hasAnthropic && hasOpenAI) {
        provider = "openai";
      } else if (provider === "gemini" && !hasGemini && hasOpenAI) {
        provider = "openai";
      } else if (provider === "gemini" && !hasGemini && hasAnthropic) {
        provider = "anthropic";
      }

      let response: string;
      switch (provider) {
        case "anthropic":
          response = await this.processWithAnthropic();
          break;
        case "openai":
          response = await this.processWithOpenAI();
          break;
        case "gemini":
          response = await this.processWithGemini();
          break;
        default:
          throw new Error(`Unsupported AI provider: ${provider}`);
      }

      // Add AI response to conversation history
      this.addToConversationHistory("assistant", response);
      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Error processing message:", new Error(errorMessage));
      throw error;
    }
  }

  /**
   * Add message to conversation history
   */
  private addToConversationHistory(
    role: "user" | "assistant" | "system",
    content: string
  ): void {
    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: "main_session",
      content,
      role,
      timestamp: new Date(),
    };

    this.conversationHistory.push(message);

    // Keep conversation history within limits
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(
        -this.maxHistoryLength
      );
    }

    this.logger.info(
      `💬 Added ${role} message to conversation history (${this.conversationHistory.length} messages total)`
    );
  }

  /**
   * Get conversation history for AI context
   */
  private getConversationContext(): Array<{
    role: "user" | "assistant";
    content: string;
  }> {
    return this.conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
  }

  /**
   * Clear conversation history
   */
  public clearConversationHistory(): void {
    this.conversationHistory = [];
    this.logger.info("🗑️ Conversation history cleared");
  }

  /**
   * Get conversation history
   */
  public getConversationHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Process message with Anthropic Claude
   */
  private async processWithAnthropic(): Promise<string> {
    if (!this.anthropicApiKey) {
      throw new Error(
        "Anthropic API key not configured. Please add your API key in settings."
      );
    }

    try {
      this.logger.info("🤖 Processing message with Anthropic Claude");

      // Build messages array from conversation history
      const messages = this.getConversationContext();

      const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: config.ai.model || "claude-3-haiku-20240307",
          max_tokens: 1500,
          messages: messages,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.anthropicApiKey,
            "anthropic-version": "2023-06-01",
          },
        }
      );

      const assistantMessage = response.data?.content?.[0]?.text;
      if (!assistantMessage) {
        throw new Error("No response received from Anthropic");
      }

      this.logger.info("✅ Anthropic response generated successfully");
      return assistantMessage;
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        "Unknown error";
      this.logger.error("❌ Anthropic API error:", new Error(errorMessage));

      // Provide helpful error messages for common issues
      if (errorMessage.includes("authentication")) {
        throw new Error(
          "Invalid Anthropic API key. Please check your API key in settings."
        );
      } else if (errorMessage.includes("rate_limit")) {
        throw new Error(
          "Anthropic API rate limit exceeded. Please try again in a moment."
        );
      } else {
        throw new Error(`Anthropic API error: ${errorMessage}`);
      }
    }
  }

  /**
   * Process message with OpenAI
   */
  private async processWithOpenAI(): Promise<string> {
    if (!this.openaiClient) {
      throw new Error(
        "OpenAI client not initialized. Please configure your API key."
      );
    }

    try {
      this.logger.info("🤖 Processing message with OpenAI GPT");

      // Build messages array with system message and conversation history
      const messages = [
        {
          role: "system" as const,
          content:
            "You are GVAIBot, a helpful AI assistant integrated into a desktop application. Provide helpful, accurate, and concise responses.",
        },
        ...this.getConversationContext(),
      ];

      const response = await this.openaiClient.chat.completions.create({
        model: config.ai.model || "gpt-3.5-turbo",
        messages: messages,
        max_tokens: 1500,
        temperature: 0.7,
        stream: false,
      });

      const assistantMessage = response.choices[0]?.message?.content;
      if (!assistantMessage) {
        throw new Error("No response received from OpenAI");
      }

      this.logger.info("✅ OpenAI response generated successfully");
      return assistantMessage;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("❌ OpenAI API error:", new Error(errorMessage));

      // Provide helpful error messages for common issues
      if (errorMessage.includes("insufficient_quota")) {
        throw new Error(
          "OpenAI API quota exceeded. Please check your billing and usage limits."
        );
      } else if (errorMessage.includes("invalid_api_key")) {
        throw new Error(
          "Invalid OpenAI API key. Please check your API key in settings."
        );
      } else if (errorMessage.includes("rate_limit_exceeded")) {
        throw new Error(
          "OpenAI API rate limit exceeded. Please try again in a moment."
        );
      } else {
        throw new Error(`OpenAI API error: ${errorMessage}`);
      }
    }
  }

  /**
   * Process message with Google Gemini
   */
  private async processWithGemini(): Promise<string> {
    if (!this.geminiModel) {
      throw new Error(
        "Gemini client not initialized. Please configure your API key."
      );
    }

    try {
      this.logger.info("🤖 Processing message with Google Gemini");

      // Build conversation context for Gemini
      const conversationContext = this.getConversationContext();
      let prompt =
        "You are GVAIBot, a helpful AI assistant integrated into a desktop application. Provide helpful, accurate, and concise responses.\n\n";

      // Add conversation history
      for (const msg of conversationContext) {
        if (msg.role === "user") {
          prompt += `Human: ${msg.content}\n\n`;
        } else if (msg.role === "assistant") {
          prompt += `Assistant: ${msg.content}\n\n`;
        }
      }

      prompt += "Assistant: ";

      const result = await this.geminiModel.generateContent(prompt);
      const response = await result.response;
      const assistantMessage = response.text();

      if (!assistantMessage) {
        throw new Error("No response received from Gemini");
      }

      this.logger.info("✅ Gemini response generated successfully");
      return assistantMessage;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("❌ Gemini API error:", new Error(errorMessage));

      // Provide helpful error messages for common issues
      if (errorMessage.includes("API_KEY_INVALID")) {
        throw new Error(
          "Invalid Gemini API key. Please check your API key in settings."
        );
      } else if (errorMessage.includes("RATE_LIMIT_EXCEEDED")) {
        throw new Error(
          "Gemini API rate limit exceeded. Please try again in a moment."
        );
      } else if (errorMessage.includes("QUOTA_EXCEEDED")) {
        throw new Error(
          "Gemini API quota exceeded. Check your usage at https://makersuite.google.com/"
        );
      } else {
        throw new Error(`Gemini API error: ${errorMessage}`);
      }
    }
  }

  /**
   * Get a mock response for testing without API keys
   */
  private getMockResponse(message: string): string {
    const responses = [
      "🔑 Please configure your API keys to start chatting! Click the settings button (⚙️) in the top-right corner and add your Google Gemini, OpenAI, or Anthropic API key.",
      "👋 Hello! I'm GVAIBot running in demo mode. To unlock real AI conversations, please add your API keys in the Settings panel.",
      "🚀 Ready to chat with real AI? Configure your Google Gemini (FREE), OpenAI (GPT), or Anthropic (Claude) API key in Settings to get started!",
      `💬 You said: "${message}"\n\n🔧 This is a demo response. Add your API keys in Settings to enable real AI conversations with Gemini, GPT, or Claude.`,
    ];

    const randomIndex = Math.floor(Math.random() * responses.length);
    const response = responses[randomIndex];
    if (!response) {
      throw new Error("No mock response available");
    }
    return response;
  }

  /**
   * Execute a function call
   */
  async executeFunctionCall(functionCall: FunctionCall): Promise<any> {
    this.logger.info("Executing function call:", functionCall.name);

    try {
      // TODO: Implement function calling logic
      // This would handle various function types and execute them
      return {
        success: true,
        result: `Function ${
          functionCall.name
        } executed with args: ${JSON.stringify(functionCall.parameters)}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        "Error executing function call:",
        new Error(errorMessage)
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get available functions for the current AI provider
   */
  getAvailableFunctions(): string[] {
    // TODO: Return actual available functions based on configuration
    return ["web_search", "file_operations", "code_execution", "data_analysis"];
  }
}
