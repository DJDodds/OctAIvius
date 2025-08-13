/**
 * Voice Service for Electron
 * Handles audio recording, processing, and speech-to-text
 */

import { config } from "../config";
import { Logger } from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

export class VoiceService {
  private logger: Logger;
  private isRecording: boolean = false;
  private recordingData: Buffer[] = [];
  private speechClient: any = null;

  constructor() {
    this.logger = new Logger("VoiceService");
    this.logger.info("🎤 Voice Service initialized");
    this.initializeSpeechClient();
  }

  /**
   * Quickly inspect the audio buffer and log diagnostics to help identify
   * mic/recording issues (container, size, plausibility checks).
   */
  private diagnoseAudioBuffer(audioBuffer: Buffer): void {
    try {
      const len = audioBuffer?.length ?? 0;
      this.logger.info(
        `🎧 Audio diagnostics: size=${len} bytes (~${Math.round(len / 1024)} KB)`
      );
      if (!len) {
        this.logger.warn("🎧 Empty audio buffer received");
        return;
      }

      const header4 = audioBuffer.slice(0, 4);
      const ascii4 = header4.toString("ascii");
      const hex4 = header4.toString("hex").toUpperCase();

      let container = "unknown";
      if (hex4 === "1A45DFA3") container = "webm/matroska (EBML)"; // EBML header
      else if (ascii4 === "OggS") container = "ogg";
      else if (ascii4 === "RIFF") {
        const wave = audioBuffer.slice(8, 12).toString("ascii");
        container = wave === "WAVE" ? "wav" : "riff";
      } else if (ascii4 === "fLaC") container = "flac";
      else {
        // Check for MP4/MP4A (ftyp) at offset 4
        const ftyp = audioBuffer.slice(4, 8).toString("ascii");
        if (ftyp === "ftyp") container = "mp4/m4a";
      }

      this.logger.info(
        `🎧 Detected container: ${container} (ascii4='${ascii4}', hex4=${hex4})`
      );

      if (container !== "webm/matroska (EBML)") {
        this.logger.warn(
          "🎧 Expected WebM Opus from MediaRecorder; if using a different container, Google STT may reject it."
        );
      }

      if (len < 4000) {
        this.logger.warn(
          "🎧 Audio buffer seems very small (<4KB). Recording might be too short or the mic stream is silent."
        );
      }
    } catch (e) {
      this.logger.warn("🎧 Failed to run audio diagnostics:", e as Error);
    }
  }

  /**
   * Initialize Google Speech-to-Text client
   */
  private async initializeSpeechClient(): Promise<void> {
    try {
      const apiKey = config.ai.provider === "gemini" ? config.ai.apiKey : null;
      if (apiKey) {
        await import("@google-cloud/speech");
        // Using REST with API key
        this.logger.info("🎤 Speech-to-Text client configured with API key (REST)");
      } else {
        this.logger.warn("🎤 No Google API key found for speech-to-text");
      }
    } catch (error) {
      this.logger.error("🎤 Failed to initialize speech client:", error as Error);
    }
  }

  /**
   * Process audio buffer to text using Google Speech-to-Text API
   */
  async processAudioToText(audioBuffer: Buffer): Promise<string> {
    try {
      const apiKey = config.ai.provider === "gemini" ? config.ai.apiKey : null;
      if (!apiKey) {
        throw new Error("No Google API key available for speech-to-text");
      }

      this.logger.info("🎤 Processing audio to text (Google STT, WEBM_OPUS)");

      // Convert audio buffer to base64
      const audioBase64 = audioBuffer.toString("base64");
      const { default: fetch } = await import("node-fetch");

      // For WEBM_OPUS, let Google infer sampleRate
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
        // Log full text to help diagnose encoding/container issues
        this.logger.error(`🎤 Google STT HTTP ${response.status} ${response.statusText}: ${t}`);
        throw new Error(`Speech API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (result.results && result.results.length > 0 && result.results[0].alternatives) {
        const transcript = result.results[0].alternatives[0].transcript;
        this.logger.info("🎤 Speech transcript:", transcript);
        return transcript;
      } else {
        this.logger.warn("🎤 No speech detected in audio (Google response contained no alternatives)");
        return "";
      }
    } catch (error) {
      this.logger.error("🎤 Error processing audio to text:", error as Error);
      throw error;
    }
  }

  /**
   * Start audio recording (placeholder; renderer handles mic capture in MVP)
   */
  async startRecording(): Promise<void> {
    if (this.isRecording) {
      throw new Error("Recording is already in progress");
    }

    this.logger.info("Starting audio recording...");
    this.isRecording = true;
    this.recordingData = [];
  }

  /**
   * Stop audio recording and return transcript (placeholder)
   */
  async stopRecording(): Promise<string> {
    if (!this.isRecording) {
      throw new Error("No recording in progress");
    }

    this.logger.info("Stopping audio recording...");
    this.isRecording = false;

    throw new Error("Recording pipeline not implemented in main process; renderer mic capture is used in MVP.");
  }

  /**
   * Process audio buffer and return transcript
   */
  async processAudio(audioBuffer: Buffer): Promise<string> {
    this.diagnoseAudioBuffer(audioBuffer);

    try {
      if (config.ai.provider === "gemini" && config.ai.apiKey) {
        return await this.processAudioToText(audioBuffer);
      }
      // No configured STT provider
      throw new Error("Speech-to-Text not configured: set a valid Google API key or switch provider.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("🎤 STT failed:", new Error(errorMessage));
      // Do not return mock transcripts; propagate error so UI can display it
      throw error;
    }
  }

  /**
   * Process audio with Google Speech-to-Text
   */
  private async processWithGoogle(audioBuffer: Buffer): Promise<string> {
    return await this.processAudioToText(audioBuffer);
  }

  /**
   * Process audio with Azure Speech Services (placeholder)
   */
  private async processWithAzure(audioBuffer: Buffer): Promise<string> {
    this.logger.info("Processing with Azure Speech Services (placeholder)");
    throw new Error("Azure Speech Services not configured.");
  }

  /**
   * Process audio locally (placeholder) — not used to avoid misleading transcripts
   */
  private async processLocally(_audioBuffer: Buffer): Promise<string> {
    throw new Error("Local/offline speech recognition not implemented.");
  }

  /**
   * Save audio buffer to file
   */
  async saveAudioFile(audioBuffer: Buffer, filename: string): Promise<string> {
    const uploadsDir = path.join(process.cwd(), "uploads");
    const filePath = path.join(uploadsDir, filename);

    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      fs.writeFileSync(filePath, audioBuffer);
      this.logger.info("Audio file saved:", filePath);
      return filePath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Error saving audio file:", new Error(errorMessage));
      throw error;
    }
  }

  /**
   * Get supported audio formats
   */
  getSupportedFormats(): string[] {
    return ["webm", "mp3", "wav", "ogg", "m4a", "flac"];
  }

  /**
   * Validate audio format
   */
  isValidFormat(filename: string): boolean {
    const extension = path.extname(filename).toLowerCase().substring(1);
    return this.getSupportedFormats().includes(extension);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.isRecording) {
      await this.stopRecording();
    }
    this.logger.info("Voice service cleanup completed");
  }
}
