import WebSocket, { RawData } from "ws";
import { Logger } from "../../utils/logger";
import { BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";

type OutboundEvent = Record<string, any>;

export class OpenAIRealtimeService {
  private logger = new Logger("OpenAIRealtime");
  private ws: WebSocket | null = null;
  private apiKey: string | null = null;
  private model: string = "gpt-4o-realtime-preview";
  private voice: string = "verse";
  private transcribeModel: string = "gpt-4o-mini-transcribe";
  private mainWindow: BrowserWindow | null = null;
  private isOpen = false;
  private transcriptBuf: string = "";
  private onTranscriptCb: ((text: string) => void) | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private gotAnyOutputForTurn = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private outputChunkCount: number = 0;
  // PoC-parity state
  private sampleRate: number = 24000;
  private appendedBytes: number = 0; // approximate bytes appended to the current input buffer
  private awaitingFinal: boolean = false; // waiting for assistant response
  private responseTimer: ReturnType<typeof setTimeout> | null = null; // fallback if no audio/text
  private waitTranscriptTimer: ReturnType<typeof setTimeout> | null = null; // UX note timer
  private replyPendingFromTranscript: boolean = false;
  private responseStarted: boolean = false;
  private activeResponseId: string | null = null;
  private responseCreatedAt: number = 0;
  private gotAudio: boolean = false;
  private gotAssistantText: boolean = false;
  private outputItemAdded: boolean = false;
  private outputContentPartAdded: boolean = false;
  private assistantTextBuf: string = "";
  // local debug log stream (separate from main app log)
  private dbgStream: fs.WriteStream | null = null;
  private appendCount: number = 0;

  private dbg(line: string, meta?: Record<string, any>) {
    try {
      if (!this.dbgStream) {
        const logDir = path.join(__dirname, "..", "..", "..", "logs");
        try {
          fs.mkdirSync(logDir, { recursive: true });
        } catch {}
        const f = path.join(logDir, "realtime.debug.log");
        this.dbgStream = fs.createWriteStream(f, { flags: "a" });
      }
      const ts = new Date().toISOString();
      const body = meta ? `${line} | ${JSON.stringify(meta)}` : line;
      this.dbgStream.write(`[${ts}] ${body}\n`);
    } catch {}
  }

  constructor(
    win: BrowserWindow | null,
    opts?: { model?: string; voice?: string }
  ) {
    this.mainWindow = win;
    if (opts?.model) this.model = opts.model;
    if (opts?.voice) this.voice = opts.voice;
  }

  // Cancel the active response (if any) to allow barge-in
  barge() {
    try {
      if (
        this.activeResponseId &&
        this.ws &&
        this.ws.readyState === WebSocket.OPEN
      ) {
        this.send({
          type: "response.cancel",
          response_id: this.activeResponseId,
        });
      } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Fallback: some servers accept cancel without id
        this.send({ type: "response.cancel" });
      }
    } catch {}
    // Locally reset awaiting/speaking state; renderer will also receive output completion events
    this.awaitingFinal = false;
    this.responseStarted = false;
    this.activeResponseId = null;
    this.responseCreatedAt = 0;
    try {
      if (this.responseTimer) {
        clearTimeout(this.responseTimer);
        this.responseTimer = null;
      }
    } catch {}
    this.emitRenderer({ type: "output.completed" });
  }

  attachWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
  }

  setApiKey(key: string | null) {
    this.apiKey = key;
  }

  setTranscribeModel(model: string | null) {
    if (model && typeof model === "string" && model.trim()) {
      this.transcribeModel = model.trim();
    }
  }

  setTranscriptHandler(cb: ((text: string) => void) | null) {
    this.onTranscriptCb = cb;
  }

  // Expose current connection state to callers
  isConnected(): boolean {
    try {
      return !!(
        this.ws &&
        this.isOpen &&
        this.ws.readyState === WebSocket.OPEN
      );
    } catch {
      return false;
    }
  }

  // Re-emit a connected status for renderer resyncs without reconnecting
  resendConnected() {
    try {
      this.emitRenderer({ type: "realtime.status", status: "connected" });
    } catch {}
  }

  async start(): Promise<void> {
    if (this.ws && this.isOpen) {
      // Session already established — re-emit a connected status so the renderer can resync
      this.logger.debug?.("Realtime already started (re-emitting connected)");
      this.dbg("start: already open");
      try {
        this.emitRenderer({ type: "realtime.status", status: "connected" });
      } catch {}
      return;
    }
    if (!this.apiKey) {
      throw new Error("Missing OpenAI API key for Realtime");
    }

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      this.model
    )}`;
    this.logger.info(`Connecting to Realtime: ${url}`);
    this.dbg("ws.connect", { url, model: this.model, voice: this.voice });
    const org = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORG;
    const ws = new WebSocket(url, undefined, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "OpenAI-Beta": "realtime=v1",
        ...(org ? { "OpenAI-Organization": org } : {}),
      },
    });

    this.ws = ws;

    // Common event wiring
    ws.on("open", () => {
      this.isOpen = true;
      this.logger.info("Realtime websocket connected");
      this.dbg("ws.open");
      // Configure session for audio I/O
      this.logger.info(
        `Realtime session.update: voice=${this.voice}, input=pcm16, output=pcm16, transcribeModel=${this.transcribeModel}`
      );
      this.send({
        type: "session.update",
        session: {
          voice: this.voice,
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          // Request live transcription events from server
          input_audio_transcription: {
            model: this.transcribeModel,
            language: "en",
          },
          // Enable server-side VAD so turns can be detected server-side too
          turn_detection: { type: "server_vad" },
          // Keep replies in English
          instructions:
            "You are a helpful voice assistant. Always reply in English.",
        },
      });
      this.emitRenderer({ type: "realtime.status", status: "connected" });

      // Keepalive ping every 15s to avoid idle disconnects
      try {
        if (this.pingTimer) clearInterval(this.pingTimer);
      } catch {}
      this.pingTimer = setInterval(() => {
        try {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            (this.ws as any).ping?.();
            this.logger.debug?.("Realtime ping sent");
            this.dbg("ws.ping");
          }
        } catch {}
      }, 15000);
    });

    ws.on("message", (data: RawData) => {
      try {
        const msg = JSON.parse((data as Buffer).toString());
        try {
          if (msg?.type) this.dbg("ws.message", { type: String(msg.type) });
        } catch {}
        this.handleInbound(msg);
      } catch (e) {
        this.logger.warn("Non-JSON message from Realtime", e as any);
        this.dbg("ws.message.nonjson");
      }
    });

    ws.on("close", (code: number, reason: Buffer) => {
      this.isOpen = false;
      this.logger.warn(
        `Realtime websocket closed: ${code} ${reason.toString()}`
      );
      this.dbg("ws.close", { code, reason: reason.toString() });
      try {
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
      } catch {}
      this.emitRenderer({
        type: "realtime.status",
        status: "closed",
        code,
        reason: reason.toString(),
      });
    });

    ws.on("error", (err: Error) => {
      this.logger.error("Realtime websocket error", err as any);
      this.dbg("ws.error", { error: String(err) });
      this.emitRenderer({
        type: "realtime.status",
        status: "error",
        error: String(err),
      });
    });

    // Log pongs for visibility (optional)
    try {
      (ws as any).on?.("pong", () => {
        this.logger.debug?.("Realtime pong received");
      });
    } catch {}

    // Wait for connection before resolving
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const onOpen = () => {
        if (done) return;
        done = true;
        cleanup();
        this.dbg("start.resolve");
        resolve();
      };
      const onErr = (err: Error) => {
        if (done) return;
        done = true;
        cleanup();
        this.dbg("start.reject", { error: String(err) });
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
    this.dbg("stop.called");
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isOpen = false;
    try {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (this.responseTimer) {
        clearTimeout(this.responseTimer);
        this.responseTimer = null;
      }
      if (this.waitTranscriptTimer) {
        clearTimeout(this.waitTranscriptTimer);
        this.waitTranscriptTimer = null;
      }
      if (this.fallbackTimer) {
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = null;
      }
    } catch {}
    try {
      this.dbg("stop.cleaned");
    } catch {}
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
    // Sanitize payload to ensure protocol compliance (strip any sample_rate* keys)
    const sanitize = (val: any): any => {
      if (val == null) return val;
      if (Array.isArray(val)) return val.map(sanitize);
      if (typeof val === "object") {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          if (k === "sample_rate" || k === "sampleRate") continue;
          out[k] = sanitize(v);
        }
        return out;
      }
      return val;
    };
    const payload = sanitize(obj);
    try {
      // Lightweight outbound diagnostics: log type and payload sizes only
      const t =
        (payload &&
          typeof (payload as any).type === "string" &&
          (payload as any).type) ||
        "(unknown)";
      const audioLen =
        payload && typeof (payload as any).audio === "string"
          ? (payload as any).audio.length
          : undefined;
      const hasItem = !!(payload as any).item;
      const hasResponse = !!(payload as any).response;
      const keys = Object.keys((payload as any) || {});
      this.dbg("ws.send", {
        type: t,
        keys,
        audioLen,
        hasItem,
        hasResponse,
      });
    } catch {}
    this.ws.send(JSON.stringify(payload));
  }

  // Append base64-encoded PCM16 audio at 24000Hz
  appendAudioBase64(b64Pcm16: string, opts?: { sampleRate?: number }) {
    if (!b64Pcm16) return;
    // Drop audio while awaiting a response to avoid mixing utterances
    if (this.awaitingFinal) {
      this.dbg("append.drop.awaiting");
      return;
    }
    const rate = opts?.sampleRate ?? this.sampleRate ?? 24000;
    this.sampleRate = rate;
    // Track approximate bytes to estimate captured duration
    try {
      const approxBytes = Math.floor((b64Pcm16.length * 3) / 4);
      this.appendedBytes += approxBytes;
      this.appendCount++;
      if (this.appendCount % 20 === 1) {
        // throttle log
        this.dbg("append", {
          count: this.appendCount,
          bytes: approxBytes,
          total: this.appendedBytes,
          rate,
        });
      }
    } catch {}
    // API expects only 'audio' once input_audio_format is set via session.update
    this.send({
      type: "input_audio_buffer.append",
      audio: b64Pcm16,
    });
  }

  // Commit current input buffer; optionally attach a user text snapshot and immediately start a response
  commitOnly(params?: { text?: string }) {
    // Ignore commits while awaiting a response
    if (this.awaitingFinal) {
      this.emitRenderer({
        type: "realtime.status",
        status: "commit_ignored_awaiting",
      });
      this.dbg("commit.ignored.awaiting");
      return;
    }
    // Require a minimum of ~200ms of audio to avoid empty-turn responses
    const bytesPerSample = 2; // pcm16
    const samples = Math.floor(this.appendedBytes / bytesPerSample);
    const ms = this.sampleRate ? (samples / this.sampleRate) * 1000 : 0;
    if (ms < 200) {
      this.logger.info(
        `Commit blocked: only ~${Math.round(ms)}ms captured (<200ms)`
      );
      this.dbg("commit.blocked", { ms: Math.round(ms) });
      this.emitRenderer({
        type: "realtime.status",
        status: "commit_blocked",
        ms: Math.round(ms),
      });
      return;
    }
    this.dbg("commit.sending", { appendedMs: Math.round(ms) });
    this.send({ type: "input_audio_buffer.commit" });
    this.awaitingFinal = true;
    this.responseStarted = false;
    this.replyPendingFromTranscript = true;
    this.gotAudio = false;
    this.gotAssistantText = false;
    // If renderer provided a transcript snapshot, attach it now and kick a response immediately
    const provided = (params?.text || "").trim();
    if (provided) {
      try {
        this.dbg("commit.with_text", { chars: provided.length });
        this.send({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: provided }],
          },
        });
        // We have content; no need to wait for server transcript before starting audio
        this.replyPendingFromTranscript = false;
        this.send({
          type: "response.create",
          response: { modalities: ["audio", "text"] },
        });
        this.responseStarted = true;
        this.responseCreatedAt = Date.now();
        this.dbg("response.create.after_text");
      } catch {}
    }
    // UX note timer
    try {
      if (this.waitTranscriptTimer) clearTimeout(this.waitTranscriptTimer);
    } catch {}
    this.waitTranscriptTimer = setTimeout(() => {
      if (this.replyPendingFromTranscript) {
        this.emitRenderer({
          type: "realtime.status",
          status: "waiting_transcript",
        });
      }
    }, 800);
    // Fallback: if no transcript/audio/text promptly, start a response to kick audio
    try {
      if (this.responseTimer) clearTimeout(this.responseTimer);
    } catch {}
    this.responseTimer = setTimeout(() => {
      if (!this.gotAudio && !this.gotAssistantText && !this.responseStarted) {
        const snapshot = (this.transcriptBuf || "").trim();
        try {
          if (snapshot) {
            this.dbg("fallback.attach_snapshot", { chars: snapshot.length });
            this.send({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: snapshot }],
              },
            });
          }
          this.send({
            type: "response.create",
            response: { modalities: ["audio", "text"] },
          });
          this.responseStarted = true;
          this.dbg("fallback.response.create");
        } catch {}
      }
    }, 2000);
  }

  // Create an audio response (speak text)
  createAudioResponse(params?: { instructions?: string }) {
    this.send({
      type: "response.create",
      response: {
        modalities: ["audio"],
        instructions: params?.instructions,
        // output format is configured via session.update; only set voice here
        audio: { voice: this.voice },
      },
    });
  }

  sendEvent(ev: OutboundEvent) {
    this.send(ev);
  }

  private handleInbound(msg: any) {
    // Forward all for now, but special-case audio for clarity
    // Normalize audio delta events from different server shapes
    if (typeof msg.type === "string") {
      const t = msg.type.toLowerCase();
      // Track buffer commit acknowledgment
      if (t === "input_audio_buffer.committed") {
        // After commit, server clears its input buffer; reset our counters
        this.appendedBytes = 0;
        this.appendCount = 0;
        this.dbg("server.buffer_committed");
        this.emitRenderer({
          type: "realtime.status",
          status: "buffer_committed",
        });
      }
      // Mark when output structures are created to help cancel/restart logic
      if (t.includes("response.output_item.added")) {
        this.outputItemAdded = true;
      }
      if (t.includes("response.content_part.added")) {
        this.outputContentPartAdded = true;
      }
      const isAudioDelta =
        /^(response\.)?(output_)?audio\.delta$/.test(t) ||
        t === "output.audio.delta" ||
        t === "response.output.audio.delta" ||
        t.includes("output_audio.delta") ||
        t.includes("output.audio.delta");

      if (isAudioDelta) {
        const chunk: string | undefined =
          (typeof msg.delta === "string" && msg.delta) ||
          (typeof msg.audio === "string" && msg.audio) ||
          (typeof (msg as any).data === "string" && (msg as any).data) ||
          undefined;
        if (chunk) {
          // Mark that output began; cancel fallback
          this.gotAnyOutputForTurn = true;
          this.gotAudio = true;
          try {
            if (this.fallbackTimer) {
              clearTimeout(this.fallbackTimer);
              this.fallbackTimer = null;
            }
          } catch {}
          try {
            if (this.responseTimer) {
              clearTimeout(this.responseTimer);
              this.responseTimer = null;
            }
          } catch {}
          // Lightweight logging for early chunks to aid diagnosis
          try {
            this.outputChunkCount++;
            if (this.outputChunkCount <= 5) {
              const approxBytes = Math.floor((chunk.length * 3) / 4);
              this.logger.info(
                `Forwarding audio delta #${this.outputChunkCount} (~${approxBytes} bytes b64)`
              );
              this.dbg("audio.delta", {
                n: this.outputChunkCount,
                bytes: approxBytes,
              });
            }
          } catch {}
          this.emitRenderer({
            type: "output.audio.delta",
            audio: chunk,
            sampleRate: 24000,
          });
          return;
        }
      }

      // Consider only audio-done/completed shapes as completion markers
      const isAudioDone =
        t === "response.audio.done" ||
        t === "response.audio.completed" ||
        t === "output.completed" ||
        t === "output.audio.completed" ||
        t.includes("output_audio.done") ||
        t.includes("output_audio.completed") ||
        t.includes("output.audio.completed") ||
        t.includes("response.output_audio.done") ||
        t.includes("response.output_audio.completed");
      if (isAudioDone) {
        this.dbg("audio.done");
        // End of turn; clear any fallback
        try {
          if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
          }
        } catch {}
        this.outputChunkCount = 0;
        this.awaitingFinal = false;
        this.responseStarted = false;
        this.activeResponseId = null;
        this.responseCreatedAt = 0;
        try {
          if (this.responseTimer) {
            clearTimeout(this.responseTimer);
            this.responseTimer = null;
          }
        } catch {}
        this.emitRenderer({ type: "output.completed" });
        return;
      }
    }
    if (
      msg.type === "response.created" ||
      msg.type === "response.completed" ||
      msg.type === "response.done"
    ) {
      if (msg.type === "response.created") {
        this.dbg("response.created");
        this.awaitingFinal = true;
        this.assistantTextBuf = "";
        this.gotAudio = false;
        this.gotAssistantText = false;
        this.responseStarted = true;
        this.activeResponseId =
          (msg.response && msg.response.id) || msg.id || null;
        this.responseCreatedAt = Date.now();
        this.outputItemAdded = false;
        this.outputContentPartAdded = false;
      } else {
        this.dbg("response.completed");
        this.awaitingFinal = false;
        try {
          if (this.responseTimer) {
            clearTimeout(this.responseTimer);
            this.responseTimer = null;
          }
        } catch {}
        this.activeResponseId = null;
        this.responseCreatedAt = 0;
        this.responseStarted = false;
        this.outputItemAdded = false;
        this.outputContentPartAdded = false;
        // Some servers emit response.done/completed without explicit audio events.
        // Emit a completion event ONLY if no audio ever arrived this turn.
        try {
          if (!this.gotAudio) {
            this.emitRenderer({ type: "output.completed" });
          }
        } catch {}
      }
      this.emitRenderer({ type: "realtime.message", data: msg });
      return;
    }
    // Assistant spoken transcript (diagnostic)
    if (msg.type === "response.audio_transcript.delta") {
      const piece = typeof msg.delta === "string" ? msg.delta : "";
      if (piece) {
        this.gotAssistantText = true;
        this.assistantTextBuf += piece;
        this.dbg("assistant_text.delta", {
          chars: this.assistantTextBuf.length,
        });
        this.emitRenderer({
          type: "realtime.assistant_text_delta",
          text: this.assistantTextBuf,
        });
        try {
          if (this.responseTimer) {
            clearTimeout(this.responseTimer);
            this.responseTimer = null;
          }
        } catch {}
      }
      return;
    }
    if (msg.type === "response.audio_transcript.done") {
      const full =
        (typeof (msg as any).transcript === "string" &&
          (msg as any).transcript) ||
        this.assistantTextBuf ||
        "";
      if (full)
        this.emitRenderer({ type: "realtime.assistant_text", text: full });
      this.dbg("assistant_text.done", { chars: full.length });
      this.assistantTextBuf = "";
      return;
    }
    // Stream input text deltas from server transcription (support multiple event shapes)
    if (typeof msg?.type === "string") {
      const t = msg.type;
      // Handle explicit input_audio_transcription.* events first
      if (/^input_audio_transcription\./i.test(t)) {
        // delta vs done/complete
        if (/\.(delta|partial)/i.test(t)) {
          const piece: string | undefined =
            (typeof msg.delta === "string" && msg.delta) ||
            (typeof msg.text === "string" && msg.text) ||
            (typeof msg.transcript === "string" && msg.transcript) ||
            undefined;
          if (piece) {
            this.transcriptBuf = (this.transcriptBuf + piece).trim();
            this.dbg("transcript.delta", { chars: this.transcriptBuf.length });
            this.emitRenderer({
              type: "realtime.transcript.delta",
              text: this.transcriptBuf,
            });
            return;
          }
        } else if (/(done|final|complete|completed)$/i.test(t)) {
          const full =
            (typeof msg.transcript === "string" && msg.transcript) ||
            this.transcriptBuf.trim();
          if (full) {
            this.dbg("transcript.done", { chars: full.length });
            this.emitRenderer({ type: "realtime.transcript", text: full });
            try {
              this.onTranscriptCb?.(full);
            } catch (e) {
              this.logger.warn("onTranscript handler threw", e as any);
            }
            // Attach to conversation; start or restart response if needed
            try {
              this.send({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [{ type: "input_text", text: full }],
                },
              });
            } catch {}
            try {
              if (this.waitTranscriptTimer) {
                clearTimeout(this.waitTranscriptTimer);
                this.waitTranscriptTimer = null;
              }
            } catch {}
            this.replyPendingFromTranscript = false;
            const ageMs = Date.now() - (this.responseCreatedAt || 0);
            if (
              !this.responseStarted &&
              this.ws &&
              this.ws.readyState === WebSocket.OPEN
            ) {
              try {
                this.send({
                  type: "response.create",
                  response: { modalities: ["audio", "text"] },
                });
                this.responseStarted = true;
                this.responseCreatedAt = Date.now();
                this.dbg("response.create.after_transcript");
              } catch {}
            } else if (
              this.responseStarted &&
              !this.gotAudio &&
              !this.gotAssistantText &&
              !this.outputItemAdded &&
              !this.outputContentPartAdded &&
              this.activeResponseId &&
              ageMs >= 800
            ) {
              try {
                this.send({
                  type: "response.cancel",
                  response_id: this.activeResponseId,
                });
                this.dbg("response.cancel.stale", { ageMs });
              } catch {}
              try {
                this.send({
                  type: "response.create",
                  response: { modalities: ["audio", "text"] },
                });
                this.responseStarted = true;
                this.responseCreatedAt = Date.now();
                this.activeResponseId = null;
                this.dbg("response.create.restart");
              } catch {}
            }
          }
          this.transcriptBuf = "";
          return;
        }
      }
      const looksDelta =
        /input_text\.(?:delta)|transcript(?:ion)?\.delta/i.test(t);
      const looksDone =
        /input_text\.(?:done)|transcript(?:ion)?\.(?:done|complete|completed)/i.test(
          t
        );
      if (looksDelta) {
        const piece: string | undefined =
          (typeof msg.delta === "string" && msg.delta) ||
          (typeof msg.text === "string" && msg.text) ||
          (typeof msg.transcript === "string" && msg.transcript) ||
          undefined;
        if (piece) {
          this.transcriptBuf += piece;
          this.dbg("transcript.delta.generic", {
            chars: this.transcriptBuf.length,
          });
          this.emitRenderer({ type: "realtime.transcript.delta", text: piece });
          return;
        }
      }
      if (looksDone) {
        const full = this.transcriptBuf.trim();
        if (full) {
          this.dbg("transcript.done.generic", { chars: full.length });
          this.emitRenderer({ type: "realtime.transcript", text: full });
          try {
            this.onTranscriptCb?.(full);
          } catch (e) {
            this.logger.warn("onTranscript handler threw", e as any);
          }
          // Attach the final transcript; if an empty response is active, cancel and restart so it includes the message
          try {
            this.send({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: full }],
              },
            });
          } catch {}
          try {
            if (this.waitTranscriptTimer) {
              clearTimeout(this.waitTranscriptTimer);
              this.waitTranscriptTimer = null;
            }
          } catch {}
          this.replyPendingFromTranscript = false;
          const ageMs = Date.now() - (this.responseCreatedAt || 0);
          if (
            !this.responseStarted &&
            this.ws &&
            this.ws.readyState === WebSocket.OPEN
          ) {
            try {
              this.send({
                type: "response.create",
                response: { modalities: ["audio", "text"] },
              });
              this.responseStarted = true;
              this.responseCreatedAt = Date.now();
              this.dbg("response.create.after_transcript.generic");
            } catch {}
          } else if (
            this.responseStarted &&
            !this.gotAudio &&
            !this.gotAssistantText &&
            !this.outputItemAdded &&
            !this.outputContentPartAdded &&
            this.activeResponseId &&
            ageMs >= 800 &&
            this.ws &&
            this.ws.readyState === WebSocket.OPEN
          ) {
            try {
              this.send({
                type: "response.cancel",
                response_id: this.activeResponseId,
              });
              this.dbg("response.cancel.stale.generic", { ageMs });
            } catch {}
            try {
              this.send({
                type: "response.create",
                response: { modalities: ["audio", "text"] },
              });
              this.responseStarted = true;
              this.responseCreatedAt = Date.now();
              this.activeResponseId = null;
              this.dbg("response.create.restart.generic");
            } catch {}
          }
        }
        this.transcriptBuf = "";
        return;
      }
    }
    // Capture input transcript text if present (model-dependent event names)
    if (
      (msg.type &&
        typeof msg.type === "string" &&
        (msg.type.includes("input_text") || msg.type.includes("transcript"))) ||
      msg.transcript != null ||
      msg.text != null
    ) {
      const delta: string | undefined = msg.delta || msg.transcript || msg.text;
      if (typeof delta === "string" && delta.length) {
        this.transcriptBuf += delta;
        this.dbg("transcript.delta.catchall", {
          chars: this.transcriptBuf.length,
        });
        this.emitRenderer({ type: "realtime.transcript.delta", text: delta });
      }
      if (
        msg.type === "response.input_text.done" ||
        msg.type === "input_audio_buffer.collected" ||
        /transcript(?:ion)?\.(?:done|complete|completed)/i.test(msg.type) ||
        msg.final === true ||
        msg.is_final === true
      ) {
        const full = this.transcriptBuf.trim();
        if (full) {
          // Notify renderer and main callback
          this.emitRenderer({ type: "realtime.transcript", text: full });
          this.dbg("transcript.done.catchall", { chars: full.length });
          try {
            this.onTranscriptCb?.(full);
          } catch (e) {
            this.logger.warn("onTranscript handler threw", e as any);
          }
        }
        this.transcriptBuf = "";
        return;
      }
    }
    if (msg.type === "error") {
      this.dbg("server.error", { detail: msg?.error || msg });
      this.emitRenderer({ type: "realtime.error", error: msg.error || msg });
      return;
    }
    // Generic passthrough (transcripts, etc.)
    this.emitRenderer({ type: "realtime.message", data: msg });
  }
}
