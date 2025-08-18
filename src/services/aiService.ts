/**
 * AI Service for Electron
 * Handles AI provider communication (Anthropic, OpenAI, Google Gemini)
 */

import { config } from "../config";
import { Logger } from "../utils/logger";
import { ChatMessage, FunctionCall } from "../types";
import OpenAI from "openai";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { OpenAIProvider } from "./ai/providers/openaiProvider";
import { GeminiProvider } from "./ai/providers/geminiProvider";
import { AnthropicProvider } from "./ai/providers/anthropicProvider";
import { ConversationManager } from "./ai/core/conversation";
import { Connectivity } from "./ai/core/connectivity";
import { getMockResponse } from "./ai/core/mock";
import { AIProcessors } from "./ai/core/processors";
import { initOpenAI, initGemini, initAnthropic } from "./ai/core/init";
import { testOpenAI, testGemini, testAnthropic } from "./ai/core/tests";

export class AIService {
  private logger: Logger;
  private openaiClient: OpenAI | null = null; // kept for compatibility
  private anthropicApiKey: string | null = null;
  private openaiApiKey: string | null = null;
  private geminiClient: GoogleGenerativeAI | null = null; // kept for compatibility
  private geminiModel: GenerativeModel | null = null; // kept for compatibility
  private geminiApiKey: string | null = null;
  // New provider wrappers
  private openaiProvider?: OpenAIProvider;
  private geminiProvider?: GeminiProvider;
  private anthropicProvider?: AnthropicProvider;
  private convo: ConversationManager;
  private connectivity: Connectivity;
  private processors?: AIProcessors;

  constructor() {
    this.logger = new Logger("AIService");
    this.logger.info(
      "AI Service initialized with provider:",
      config.ai.provider
    );

    // Initialize core helpers
    this.convo = new ConversationManager(this.logger, 20);
    this.connectivity = new Connectivity(this.logger);

    // Initialize API keys if available
    // Prefer explicit OpenAI key; only fall back to config when provider is openai
    this.openaiApiKey =
      process.env.OPENAI_API_KEY ||
      (config.ai.provider === "openai" ? (config.ai.apiKey as string | null) : null);
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
    const { client, provider } = initOpenAI(this.logger, this.openaiApiKey);
    this.openaiClient = client;
    if (provider) this.openaiProvider = provider;
  }

  /**
   * Initialize Google Gemini client
   */
  private initializeGemini(): void {
    const { client, model, provider } = initGemini(
      this.logger,
      this.geminiApiKey
    );
    this.geminiClient = client;
    this.geminiModel = model;
    if (provider) this.geminiProvider = provider;
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
      const { provider } = initAnthropic(this.logger, this.anthropicApiKey);
      if (provider) this.anthropicProvider = provider;
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
    return this.connectivity.basicReachability();
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
    provider?: "openai" | "anthropic" | "gemini"
  ): Promise<boolean> {
    try {
      const chosen: "openai" | "anthropic" | "gemini" =
        provider ?? (config.ai.provider as any);
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

  if (chosen === "gemini") {
        if (!this.geminiApiKey) {
          this.logger.error("❌ No Gemini API key configured");
          return false;
        }
        if (!this.geminiModel) this.initializeGemini();
        const ok = await testGemini(
          this.logger,
          this.geminiModel,
          this.geminiApiKey
        );
        this.logger.info(
          ok
            ? "✅ Gemini connection successful"
            : "❌ Gemini connection failed - no response"
        );
        return ok;
  } else if (chosen === "openai") {
        if (!this.openaiClient) this.initializeOpenAI();
        const ok = await testOpenAI(
          this.logger,
          this.openaiClient,
          this.openaiApiKey
        );
        this.logger.info(
          ok
            ? "✅ OpenAI connection successful"
            : "❌ OpenAI connection failed - no response"
        );
        return ok;
  } else if (chosen === "anthropic") {
        const ok = await testAnthropic(this.logger, this.anthropicApiKey);
        this.logger.info(
          ok
            ? "✅ Anthropic connection successful"
            : "❌ Anthropic connection failed - no response"
        );
        return ok;
      }

  this.logger.error(`❌ Unknown provider: ${chosen}`);
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
      this.convo.add("user", message);

      // Check if we have API keys configured for any provider
      const hasOpenAI = !!this.openaiProvider && this.openaiProvider.isReady();
      const hasAnthropic = !!this.anthropicApiKey;
      const hasGemini = !!this.geminiProvider && this.geminiProvider.isReady();

      if (!hasOpenAI && !hasAnthropic && !hasGemini) {
        const mockResponse = getMockResponse(message);
        this.convo.add("assistant", mockResponse);
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

      // Build processors facade (omit undefined providers)
      const providers: {
        openai?: OpenAIProvider;
        anthropic?: AnthropicProvider;
        gemini?: GeminiProvider;
      } = {};
      if (this.openaiProvider) providers.openai = this.openaiProvider;
      if (this.anthropicProvider) providers.anthropic = this.anthropicProvider;
      if (this.geminiProvider) providers.gemini = this.geminiProvider;
      this.processors =
        this.processors || new AIProcessors(this.logger, this.convo, providers);

      let response: string;
      switch (provider) {
        case "anthropic":
          response = await this.processors.withAnthropic(
            this.anthropicApiKey || undefined
          );
          break;
        case "openai":
          response = await this.processors.withOpenAI();
          break;
        case "gemini":
          response = await this.processors.withGemini();
          break;
        default:
          throw new Error(`Unsupported AI provider: ${provider}`);
      }

      // Add AI response to conversation history
      this.convo.add("assistant", response);
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
  // Conversation helpers now delegated to ConversationManager

  /**
   * Get conversation history for AI context
   */
  private getConversationContext(): Array<{
    role: "user" | "assistant";
    content: string;
  }> {
    return this.convo.context();
  }

  /**
   * Clear conversation history
   */
  public clearConversationHistory(): void {
    this.convo.clear();
  }

  /**
   * Get conversation history
   */
  public getConversationHistory(): ChatMessage[] {
    return this.convo.list();
  }

  // Provider-specific processing moved to AIProcessors

  /**
   * Get a mock response for testing without API keys
   */
  // Mock responses moved to ./ai/core/mock

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
