import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { Logger } from "../../../utils/logger";

export class GeminiProvider {
  private client: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  constructor(private logger: Logger, private apiKey: string | null) {}

  init() {
    if (!this.apiKey) return;
    try {
      this.client = new GoogleGenerativeAI(this.apiKey);
      this.model = this.client.getGenerativeModel({
        model: "gemini-1.5-flash",
      });
      this.logger.info("✅ Gemini client initialized");
    } catch (e: any) {
      this.logger.error("❌ Failed to initialize Gemini client:", e);
    }
  }

  isReady() {
    return !!this.model;
  }

  async generateText(prompt: string): Promise<string> {
    if (!this.model) throw new Error("Gemini client not initialized");
    const result = await this.model.generateContent(prompt);
    const resp = await result.response;
    const text = resp.text();
    if (!text) throw new Error("No response received from Gemini");
    return text;
  }
}
