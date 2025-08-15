import axios from "axios";
import { Logger } from "../../../utils/logger";
import { config } from "../../../config";

export class AnthropicProvider {
  constructor(private logger: Logger, private apiKey: string | null) {}

  isReady() {
    return !!this.apiKey;
  }

  async chat(
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<string> {
    if (!this.apiKey) throw new Error("Anthropic API key not configured");
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: config.ai.model || "claude-3-haiku-20240307",
        max_tokens: 1500,
        messages,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
      }
    );
    const text = response.data?.content?.[0]?.text;
    if (!text) throw new Error("No response received from Anthropic");
    return text;
  }
}
