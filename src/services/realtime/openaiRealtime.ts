import WebSocket, { RawData } from "ws";
import { Logger } from "../../utils/logger";
import { BrowserWindow } from "electron";

type OutboundEvent = Record<string, any>;

export class OpenAIRealtimeService {
  private logger = new Logger("OpenAIRealtime");
  private ws: WebSocket | null = null;
  private apiKey: string | null = null;
  private model: string = "gpt-4o-realtime-preview";
  private voice: string = "verse";
  private mainWindow: BrowserWindow | null = null;
  private isOpen = false;
  private transcriptBuf: string = "";
  private onTranscriptCb: ((text: string) => void) | null = null;

  constructor(
    win: BrowserWindow | null,
    opts?: { model?: string; voice?: string }
  ) {
    this.mainWindow = win;
    if (opts?.model) this.model = opts.model;
    if (opts?.voice) this.voice = opts.voice;
  }

  attachWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
  }

  setApiKey(key: string | null) {
    this.apiKey = key;
  }

  setTranscriptHandler(cb: ((text: string) => void) | null) {
    this.onTranscriptCb = cb;
  }

  async start(): Promise<void> {
    if (this.ws && this.isOpen) {
      this.logger.info("Realtime already started");
      return;
    }
    if (!this.apiKey) {
      throw new Error("Missing OpenAI API key for Realtime");
    }

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      this.model
    )}`;
    this.logger.info(`Connecting to Realtime: ${url}`);
    const ws = new WebSocket(url, undefined, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    this.ws = ws;

    // Common event wiring
    ws.on("open", () => {
      this.isOpen = true;
      this.logger.info("Realtime websocket connected");
      // Configure session for audio I/O
      this.send({
        type: "session.update",
        session: {
          voice: this.voice,
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          // Ask server to provide input transcription events
          input_audio_transcription: {
            // Prefer env override; fall back to whisper-1 for broad availability
            model: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1",
          },
        },
      });
      this.emitRenderer({ type: "realtime.status", status: "connected" });
    });

    ws.on("message", (data: RawData) => {
      try {
        const msg = JSON.parse((data as Buffer).toString());
        this.handleInbound(msg);
      } catch (e) {
        this.logger.warn("Non-JSON message from Realtime", e as any);
      }
    });

    ws.on("close", (code: number, reason: Buffer) => {
      this.isOpen = false;
      this.logger.warn(
        `Realtime websocket closed: ${code} ${reason.toString()}`
      );
      this.emitRenderer({ type: "realtime.status", status: "closed" });
    });

    ws.on("error", (err: Error) => {
      this.logger.error("Realtime websocket error", err as any);
      this.emitRenderer({
        type: "realtime.status",
        status: "error",
        error: String(err),
      });
    });

    // Wait for connection before resolving
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const onOpen = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve();
      };
      const onErr = (err: Error) => {
        if (done) return;
        done = true;
        cleanup();
        reject(err);
      };
      const timer = setTimeout(
        () => onErr(new Error("Realtime connect timeout")),
        8000
      );
      const cleanup = () => {
        try {
          clearTimeout(timer);
          ws.off("open", onOpen);
          ws.off("error", onErr);
        } catch {}
      };
      ws.on("open", onOpen);
      ws.on("error", onErr);
    });
  }

  stop() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isOpen = false;
  }

  private emitRenderer(payload: any) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("realtime:event", payload);
      }
    } catch (e) {
      this.logger.warn("Failed to emit to renderer", e as any);
    }
  }

  private send(obj: OutboundEvent) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(obj));
  }

  // Append base64-encoded PCM16 audio at 24000Hz
  appendAudioBase64(b64Pcm16: string, opts?: { sampleRate?: number }) {
    if (!b64Pcm16) return;
    const rate = opts?.sampleRate ?? 24000;
    this.send({
      type: "input_audio_buffer.append",
      audio: b64Pcm16,
      sample_rate: rate,
      format: "pcm16",
    });
  }

  // Commit current input buffer (do not auto-create a response)
  commitOnly() {
    this.send({ type: "input_audio_buffer.commit" });
  }

  // Create an audio response (speak text)
  createAudioResponse(params?: { instructions?: string }) {
    this.send({
      type: "response.create",
      response: {
        modalities: ["audio"],
        instructions: params?.instructions,
        audio: { voice: this.voice, format: "pcm16" },
      },
    });
  }

  sendEvent(ev: OutboundEvent) {
    this.send(ev);
  }

  private handleInbound(msg: any) {
    // Forward all for now, but special-case audio for clarity
    if (msg.type === "response.output_audio.delta" && msg.delta) {
      // delta: base64 pcm16 chunk
      this.emitRenderer({
        type: "output.audio.delta",
        audio: msg.delta,
        sampleRate: 24000,
      });
      return;
    }
    if (msg.type === "response.completed") {
      this.emitRenderer({ type: "output.completed" });
      return;
    }
    // Stream input text deltas from server transcription
    if (msg.type === "response.input_text.delta" && typeof msg.delta === "string") {
      this.transcriptBuf += msg.delta;
      this.emitRenderer({ type: "realtime.transcript.delta", text: msg.delta });
      return;
    }
    if (msg.type === "response.input_text.done") {
      const full = this.transcriptBuf.trim();
      if (full) {
        this.emitRenderer({ type: "realtime.transcript", text: full });
        try { this.onTranscriptCb?.(full); } catch (e) {
          this.logger.warn("onTranscript handler threw", e as any);
        }
      }
      this.transcriptBuf = "";
      return;
    }
    // Capture input transcript text if present (model-dependent event names)
    if (
      (msg.type && typeof msg.type === "string" && msg.type.includes("input_text")) ||
      (msg.transcript != null) ||
      (msg.text != null && msg.role === "user")
    ) {
      const delta: string | undefined = msg.delta || msg.transcript || msg.text;
      if (typeof delta === "string" && delta.length) {
        this.transcriptBuf += delta;
        this.emitRenderer({ type: "realtime.transcript.delta", text: delta });
      }
      if (
        msg.type === "response.input_text.done" ||
        msg.type === "input_audio_buffer.collected" ||
        msg.final === true
      ) {
        const full = this.transcriptBuf.trim();
        if (full) {
          // Notify renderer and main callback
          this.emitRenderer({ type: "realtime.transcript", text: full });
          try { this.onTranscriptCb?.(full); } catch (e) {
            this.logger.warn("onTranscript handler threw", e as any);
          }
        }
        this.transcriptBuf = "";
        return;
      }
    }
    if (msg.type === "error") {
      this.emitRenderer({ type: "realtime.error", error: msg.error || msg });
      return;
    }
    // Generic passthrough (transcripts, etc.)
    this.emitRenderer({ type: "realtime.message", data: msg });
  }
}
