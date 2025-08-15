import axios from "axios";
import { Logger } from "../../../utils/logger";

export class Connectivity {
  constructor(private logger: Logger) {}

  async basicReachability(
    url = "https://api.openai.com/v1/models"
  ): Promise<boolean> {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: { "User-Agent": "GVAIBot/1.0.0" },
      });
      return response.status === 401;
    } catch (error: any) {
      if (error?.response?.status === 401) return true;
      this.logger.error(
        "❌ Internet connectivity test failed:",
        new Error(error?.message || "Unknown error")
      );
      return false;
    }
  }
}
