import OpenAI from "openai";
import { Logger } from "../../../utils/logger";
import { config } from "../../../config";

export class OpenAIProvider {
  private client: OpenAI | null = null;
  constructor(private logger: Logger, private apiKey: string | null) {}

  init() {
    if (!this.apiKey) return;
    try {
      this.client = new OpenAI({ apiKey: this.apiKey });
      this.logger.info("✅ OpenAI client initialized");
    } catch (e: any) {
      this.logger.error("❌ Failed to initialize OpenAI client:", e);
    }
  }

  isReady() {
    return !!this.client;
  }

  async chat(
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>
  ): Promise<string> {
    if (!this.client) throw new Error("OpenAI client not initialized");
    const res = await this.client.chat.completions.create({
      model: config.ai.model || "gpt-3.5-turbo",
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    });
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error("No response received from OpenAI");
    return text;
  }
}
