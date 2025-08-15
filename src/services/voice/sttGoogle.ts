import { config } from "../../config";
import { Logger } from "../../utils/logger";

export class GoogleSTT {
  constructor(private logger: Logger) {}

  async recognizeWebmOpus(audioBuffer: Buffer): Promise<string> {
    const apiKey = config.ai.provider === "gemini" ? config.ai.apiKey : null;
    if (!apiKey)
      throw new Error("No Google API key available for speech-to-text");

    const audioBase64 = audioBuffer.toString("base64");
    const { default: fetch } = await import("node-fetch");
    const body: any = {
      config: {
        encoding: "WEBM_OPUS",
        languageCode: "en-US",
        enableAutomaticPunctuation: true,
      },
      audio: { content: audioBase64 },
    };
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!response.ok) {
      const t = await response.text();
      this.logger.error(
        `🎤 Google STT HTTP ${response.status} ${response.statusText}: ${t}`
      );
      throw new Error(
        `Speech API error: ${response.status} ${response.statusText}`
      );
    }
    const result = await response.json();
    if (
      result.results &&
      result.results.length > 0 &&
      result.results[0].alternatives
    ) {
      return result.results[0].alternatives[0].transcript || "";
    }
    return "";
  }
}
