import { Logger } from "../../../utils/logger";
import { ConversationManager } from "./conversation";
import { OpenAIProvider } from "../providers/openaiProvider";
import { AnthropicProvider } from "../providers/anthropicProvider";
import { GeminiProvider } from "../providers/geminiProvider";

export class AIProcessors {
  constructor(
    private logger: Logger,
    private convo: ConversationManager,
    private providers: {
      openai?: OpenAIProvider;
      anthropic?: AnthropicProvider;
      gemini?: GeminiProvider;
    }
  ) {}

  async withAnthropic(apiKey?: string): Promise<string> {
    if (!apiKey)
      throw new Error(
        "Anthropic API key not configured. Please add your API key in settings."
      );
    try {
      this.logger.info("🤖 Processing message with Anthropic Claude");
      const provider =
        this.providers.anthropic || new AnthropicProvider(this.logger, apiKey);
      this.providers.anthropic = provider;
      const text = await provider.chat(this.convo.context());
      this.logger.info("✅ Anthropic response generated successfully");
      return text;
    } catch (error: any) {
      const msg =
        error?.response?.data?.error?.message ||
        error?.message ||
        "Unknown error";
      this.logger.error("❌ Anthropic API error:", new Error(msg));
      if (msg.includes("authentication"))
        throw new Error(
          "Invalid Anthropic API key. Please check your API key in settings."
        );
      if (msg.includes("rate_limit"))
        throw new Error(
          "Anthropic API rate limit exceeded. Please try again in a moment."
        );
      throw new Error(`Anthropic API error: ${msg}`);
    }
  }

  async withOpenAI(): Promise<string> {
    const openai = this.providers.openai;
    if (!openai || !openai.isReady()) {
      throw new Error(
        "OpenAI client not initialized. Please configure your API key."
      );
    }
    try {
      this.logger.info("🤖 Processing message with OpenAI GPT");
      const messages = [
        {
          role: "system" as const,
          content:
            "You are GVAIBot, a helpful AI assistant integrated into a desktop application. Provide helpful, accurate, and concise responses.",
        },
        ...this.convo.context(),
      ];
      const text = await openai.chat(messages);
      this.logger.info("✅ OpenAI response generated successfully");
      return text;
    } catch (error: any) {
      const msg = error?.message || "Unknown error";
      this.logger.error("❌ OpenAI API error:", new Error(msg));
      if (msg.includes("insufficient_quota"))
        throw new Error(
          "OpenAI API quota exceeded. Please check your billing and usage limits."
        );
      if (msg.includes("invalid_api_key"))
        throw new Error(
          "Invalid OpenAI API key. Please check your API key in settings."
        );
      if (msg.includes("rate_limit_exceeded"))
        throw new Error(
          "OpenAI API rate limit exceeded. Please try again in a moment."
        );
      throw new Error(`OpenAI API error: ${msg}`);
    }
  }

  async withGemini(): Promise<string> {
    const gemini = this.providers.gemini;
    if (!gemini || !gemini.isReady()) {
      throw new Error(
        "Gemini client not initialized. Please configure your API key."
      );
    }
    try {
      this.logger.info("🤖 Processing message with Google Gemini");
      const context = this.convo.context();
      let prompt =
        "You are GVAIBot, a helpful AI assistant integrated into a desktop application. Provide helpful, accurate, and concise responses.\n\n";
      for (const msg of context) {
        if (msg.role === "user") prompt += `Human: ${msg.content}\n\n`;
        else if (msg.role === "assistant")
          prompt += `Assistant: ${msg.content}\n\n`;
      }
      prompt += "Assistant: ";
      const text = await gemini.generateText(prompt);
      this.logger.info("✅ Gemini response generated successfully");
      return text;
    } catch (error: any) {
      const msg = error?.message || "Unknown error";
      this.logger.error("❌ Gemini API error:", new Error(msg));
      if (msg.includes("API_KEY_INVALID"))
        throw new Error(
          "Invalid Gemini API key. Please check your API key in settings."
        );
      if (msg.includes("RATE_LIMIT_EXCEEDED"))
        throw new Error(
          "Gemini API rate limit exceeded. Please try again in a moment."
        );
      if (msg.includes("QUOTA_EXCEEDED"))
        throw new Error(
          "Gemini API quota exceeded. Check your usage at https://makersuite.google.com/"
        );
      throw new Error(`Gemini API error: ${msg}`);
    }
  }
}
