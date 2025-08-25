import { useEffect, useRef, useState, useCallback } from "react";

// Lightweight debug helper for renderer logs
const dbg = (...args: any[]) => {
  try {
    // eslint-disable-next-line no-console
    console.log("[realtime]", ...args);
  } catch {}
};

// Also mirror key debug lines to a file via main's console capture
function dbgState(tag: string, data?: any) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[realtime:state] ${tag}`, data || "");
  } catch {}
}

// Minimal PCM16 <-> Audio helpers
function floatTo16BitPCM(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const v = input[i] ?? 0;
    const s = Math.max(-1, Math.min(1, v));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.length;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
  return bytes;
}

export function useOpenAIRealtime(cfg?: {
  micBoost?: number;
  vadSensitivity?: "low" | "medium" | "high";
}) {
  // Mic and meter tuning
  const MIC_GAIN = Math.max(0.5, Math.min(4, cfg?.micBoost ?? 2.0));
  const METER_GAIN = 2.5; // visual boost for VU only
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAwaiting, setIsAwaiting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [vu, setVu] = useState(0); // smoothed RMS 0..1
  const [voiceActive, setVoiceActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const autoRestartRef = useRef(true); // auto-restart listening after speaking
  // Refs to avoid stale state inside event handlers
  const connectedRef = useRef(false);
  const isStreamingRef = useRef(false);
  const isAwaitingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const awaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vuRef = useRef(0);
  const lastVuTsRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | AudioWorkletNode | null>(
    null
  );
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackGainRef = useRef<GainNode | null>(null);
  const playbackNextTimeRef = useRef<number>(0);
  const startMicTsRef = useRef<number>(0);

  // Helper to stop/clear any scheduled playback immediately
  const stopPlayback = useCallback(() => {
    try {
      playbackNodeRef.current?.stop();
    } catch {}
    playbackNodeRef.current = null;
    try {
      playbackCtxRef.current?.close();
    } catch {}
    playbackCtxRef.current = null;
    playbackGainRef.current = null;
    playbackNextTimeRef.current = 0;
  }, []);

  // Resume/unlock the playback AudioContext on a user gesture
  useEffect(() => {
    const resumePlayback = async () => {
      const ctx = playbackCtxRef.current;
      if (ctx && ctx.state === "suspended") {
        try {
          dbg("Resuming suspended playback AudioContext");
          await ctx.resume();
        } catch {}
      }
    };
    const handler = () => void resumePlayback();
    window.addEventListener("pointerdown", handler, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", handler, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("pointerdown", handler, {
        capture: true,
      } as any);
      window.removeEventListener("keydown", handler, { capture: true } as any);
    };
  }, []);

  function ensurePlaybackCtx(): AudioContext {
    let ctx = playbackCtxRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      playbackCtxRef.current = ctx;
      playbackGainRef.current = ctx.createGain();
      playbackGainRef.current.gain.value = 1.25; // modest boost
      playbackGainRef.current.connect(ctx.destination);
      playbackNextTimeRef.current = ctx.currentTime;
      dbg("Created playback AudioContext", { deviceRate: ctx.sampleRate });
    }
    return ctx;
  }

  function testBeep(durationMs = 200, freq = 660) {
    try {
      const ctx = ensurePlaybackCtx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.08, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
      osc.connect(g);
      (playbackGainRef.current || g).connect(
        (playbackCtxRef.current || ctx).destination
      );
      g.connect(ctx.destination);
      osc.start();
      osc.stop(t0 + durationMs / 1000 + 0.02);
    } catch (e) {
      // ignore
    }
  }

  function resampleLinear(
    input: Float32Array,
    fromRate: number,
    toRate: number
  ): Float32Array {
    if (!input.length) return new Float32Array(0);
    if (fromRate === toRate) return input;
    const ratio = toRate / fromRate;
    const outLen = Math.max(1, Math.floor(input.length * ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcPos = i / ratio;
      const i0 = Math.floor(srcPos);
      const i1 = Math.min(input.length - 1, i0 + 1);
      const t = srcPos - i0;
      const s0 = input[i0] ?? 0;
      const s1 = input[i1] ?? 0;
      out[i] = s0 + (s1 - s0) * t;
    }
    return out;
  }

  const clearAwaitingTimer = useCallback(() => {
    if (awaitingTimerRef.current) {
      clearTimeout(awaitingTimerRef.current);
      awaitingTimerRef.current = null;
    }
  }, []);

  const beginAwaiting = useCallback(() => {
    try {
      dbg("beginAwaiting: set Thinking state");
    } catch {}
    setIsAwaiting(true);
    isAwaitingRef.current = true;
    // Reflect that we’re not actively listening for a new utterance now
    setIsStreaming(false);
    isStreamingRef.current = false;
    clearAwaitingTimer();
    // Safety timeout: if no audio or completion arrives, exit thinking and restart listening
    awaitingTimerRef.current = setTimeout(() => {
      if (isAwaitingRef.current && !isSpeakingRef.current) {
        dbgState("awaiting.timeout.restart_listen");
        setIsAwaiting(false);
        isAwaitingRef.current = false;
        // Attempt to re-enter listening if still connected
        setTimeout(() => {
          if (
            connectedRef.current &&
            !isStreamingRef.current &&
            !isSpeakingRef.current &&
            !isAwaitingRef.current
          ) {
            dbgState("auto.startMic.after.awaiting.timeout");
            void startMic();
          }
        }, 100);
      }
    }, 8000);
  }, [clearAwaitingTimer]);

  useEffect(() => {
    const off = window.electronAPI.realtime.onEvent((ev) => {
      if (ev?.type === "realtime.status") {
        dbg("Status", ev);
        dbgState("status", ev);
        // Only flip connected true on 'connected' and false on terminal states; otherwise keep prior value
        if (ev.status === "connected") {
          setConnected(true);
          connectedRef.current = true;
        }
        if (ev.status === "buffer_committed") {
          // We’ve committed the input; stay in awaiting until output starts/finishes
          beginAwaiting();
          return;
        }
        if (ev.status === "error") setError(ev.error || "Realtime error");
        // If a commit was blocked (too little audio), immediately re-arm listening
        if (ev.status === "commit_blocked") {
          setIsAwaiting(false);
          isAwaitingRef.current = false;
          clearAwaitingTimer();
          setTimeout(() => {
            if (
              connectedRef.current &&
              !isStreamingRef.current &&
              !isAwaitingRef.current &&
              !isSpeakingRef.current
            ) {
              void startMic();
            }
          }, 50);
          return; // don't fall through to disconnect handling
        }
        if (ev.status === "closed" || ev.status === "error") {
          setConnected(false);
          connectedRef.current = false;
          setIsStreaming(false);
          setIsAwaiting(false);
          setIsSpeaking(false);
          isStreamingRef.current = false;
          isAwaitingRef.current = false;
          isSpeakingRef.current = false;
          clearAwaitingTimer();
          // Stop any remaining playback on disconnect
          stopPlayback();
          setVoiceActive(false);
          setVu(0);
          vuRef.current = 0;
          setLiveTranscript("");
        } else if (ev.status === "connected") {
          // Auto-start listening on connect if idle
          if (
            !isStreamingRef.current &&
            !isAwaitingRef.current &&
            !isSpeakingRef.current
          ) {
            setTimeout(() => {
              dbgState("auto.startMic.on.connected");
              void startMic();
            }, 50);
          }
        } else {
          // Other statuses (e.g., waiting_transcript, buffer_committed) are handled above or are informational.
        }
      } else if (ev?.type === "output.audio.delta") {
        try {
          dbg(
            "Delta received (b64)",
            typeof ev.audio === "string" ? ev.audio.length : -1
          );
        } catch {}
        // Base64 PCM16 from server — resample and schedule playback with a small lead
        try {
          // entering speaking state on first delta
          setIsSpeaking(true);
          setIsAwaiting(false);
          isSpeakingRef.current = true;
          isAwaitingRef.current = false;
          clearAwaitingTimer();
          dbgState("speaking.delta");

          const u8 = base64ToUint8Array(ev.audio);
          const int16 = new Int16Array(
            u8.buffer,
            u8.byteOffset,
            Math.floor(u8.byteLength / 2)
          );
          const inRate = ev.sampleRate || 24000;
          const ctx = ensurePlaybackCtx();
          if (ctx.state === "suspended") {
            try {
              // Fire-and-forget resume; we're already in an event handler
              void ctx.resume();
            } catch {}
          }
          // Convert Int16 to Float32
          const f32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            f32[i] = (int16[i] ?? 0) / 0x8000;
          }
          const resampled: Float32Array = resampleLinear(
            f32,
            inRate,
            ctx.sampleRate
          );
          // Apply a gentle boost similar to the PoC and clamp to [-1,1]
          const outF32 = new Float32Array(resampled.length);
          try {
            const BOOST = 1.6;
            for (let i = 0; i < resampled.length; i++) {
              const src = resampled[i] ?? 0;
              let v = src * BOOST;
              if (v > 1) v = 1;
              else if (v < -1) v = -1;
              outF32[i] = v;
            }
          } catch {}
          dbg("Audio delta", {
            bytes: u8.byteLength,
            samplesIn: int16.length,
            inRate,
            deviceRate: ctx.sampleRate,
            samplesOut: outF32.length,
            ctxState: ctx.state,
          });
          const audioBuf = ctx.createBuffer(1, outF32.length, ctx.sampleRate);
          audioBuf.getChannelData(0).set(outF32);
          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          const gain = playbackGainRef.current!;
          src.connect(gain);
          const lead = 0.05; // 50ms scheduling lead to avoid gaps
          const when = Math.max(
            ctx.currentTime + lead,
            playbackNextTimeRef.current || ctx.currentTime + lead
          );
          const duration = outF32.length / ctx.sampleRate;
          try {
            src.start(when);
          } catch {}
          playbackNextTimeRef.current = when + duration;
          dbg("Scheduled chunk", {
            when,
            duration,
            next: playbackNextTimeRef.current,
          });
          playbackNodeRef.current = src;
        } catch (e) {
          console.warn("Failed to play realtime audio delta", e);
        }
      } else if (ev?.type === "output.completed") {
        dbg("Output completed; resetting playback clock");
        setIsSpeaking(false);
        setIsAwaiting(false);
        isSpeakingRef.current = false;
        isAwaitingRef.current = false;
        clearAwaitingTimer();
        // Clear transcript shortly after speaking completes
        setTimeout(() => setLiveTranscript(""), 250);
        // Auto re-arm listening so Live mode persists across turns
        setTimeout(() => {
          if (
            connectedRef.current &&
            !isStreamingRef.current &&
            !isAwaitingRef.current &&
            !isSpeakingRef.current
          ) {
            dbgState("auto.startMic.after.output");
            void startMic();
          }
        }, 150);
        // Reset playback clock so next response starts promptly
        const ctx = playbackCtxRef.current;
        if (ctx)
          playbackNextTimeRef.current = Math.max(
            ctx.currentTime,
            playbackNextTimeRef.current || 0
          );
      } else if (
        ev?.type === "realtime.message" &&
        ev?.data?.type === "response.created"
      ) {
        dbg("Response created; entering awaiting state");
        // In case a response is created by other triggers, show thinking
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        beginAwaiting();
      } else if (
        ev?.type === "realtime.message" &&
        ev?.data?.type === "response.completed"
      ) {
        // Some servers emit response.completed before audio finishes (or even before it starts).
        // Don’t toggle states here; wait for output.audio.delta (enter speaking) or output.completed.
        dbg("Response completed (deferring state change until audio events)");
      } else if (
        ev?.type === "realtime.message" &&
        ev?.data?.type === "response.done"
      ) {
        // Fallback: treat response.done as completion in case audio.done was suppressed.
        dbg("Response done (treating as completion)");
        setIsSpeaking(false);
        setIsAwaiting(false);
        isSpeakingRef.current = false;
        isAwaitingRef.current = false;
        clearAwaitingTimer();
        setTimeout(() => {
          if (
            connectedRef.current &&
            !isStreamingRef.current &&
            !isAwaitingRef.current &&
            !isSpeakingRef.current
          ) {
            dbgState("auto.startMic.after.response.done");
            void startMic();
          }
        }, 150);
      } else if (ev?.type === "realtime.transcript.delta") {
        const delta = typeof ev.text === "string" ? ev.text : "";
        if (delta) {
          dbgState("transcript.delta", { len: delta.length });
          setLiveTranscript((s) => (s + delta).slice(-800));
        }
      } else if (ev?.type === "realtime.transcript") {
        const full = typeof ev.text === "string" ? ev.text : "";
        if (full) {
          dbgState("transcript.done", { len: full.length });
          setLiveTranscript(full);
          // Post the transcript into chat as a user message
          try {
            if (full.trim()) {
              // Route through existing chat pipeline so MCP NL intents are available
              void window.electronAPI.chat
                ?.sendMessage?.(full.trim())
                .catch(() => void 0);
            }
          } catch {}
        }
      }
    });
    return () => off();
  }, []);

  const start = async (opts?: { model?: string; voice?: string }) => {
    setError(null);
    await window.electronAPI.realtime.start(opts);
  };

  const stop = async () => {
    try {
      // Try to cancel any in-flight assistant output first
      await window.electronAPI.realtime.barge?.();
    } catch {}
    try {
      await window.electronAPI.realtime.stop();
    } catch {}
    // Fully release mic and playback, and reset local state
    clearAwaitingTimer();
    stopMic();
    stopPlayback();
    setConnected(false);
    setIsStreaming(false);
    setIsAwaiting(false);
    setIsSpeaking(false);
    connectedRef.current = false;
    isStreamingRef.current = false;
    isAwaitingRef.current = false;
    isSpeakingRef.current = false;
    setVoiceActive(false);
    setVu(0);
    vuRef.current = 0;
    setLiveTranscript("");
  };

  const startMic = useCallback(async () => {
    if (isStreamingRef.current) return;
    dbg("startMic: begin");
    // Fast path: if capture pipeline already exists, just re-arm listening without re-capturing
    try {
      const existingCtx = audioCtxRef.current;
      const existingSrc = sourceRef.current;
      const existingProc = processorRef.current;
      if (existingCtx && existingSrc && existingProc) {
        if (existingCtx.state === "suspended") {
          try {
            await existingCtx.resume();
          } catch {}
        }
        ensurePlaybackCtx();
        startMicTsRef.current = Date.now();
        setIsStreaming(true);
        isStreamingRef.current = true;
        dbgState("mic.rearmed.reuse");
        setLiveTranscript("");
        return;
      }
    } catch {}
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          // Avoid AGC which can slowly crush levels and VAD
          autoGainControl: false,
        } as any,
        video: false as any,
      });
    } catch (e) {
      dbgState("getUserMedia.error", { error: String(e) });
      throw e;
    }
    const ctx = (audioCtxRef.current ||= new AudioContext());
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
    }
    // Proactively unlock and play a short beep to confirm output path
    try {
      ensurePlaybackCtx(); /* removed testBeep to avoid VAD triggering */
    } catch {}
    const source = (sourceRef.current = ctx.createMediaStreamSource(stream));
    // Simple VAD variables (shared across implementations)
    let hadSpeech = false;
    let firstVoiceTs = 0;
    let lastVoiceTs = Date.now();
    let noiseFloor = 0.0015; // running baseline RMS
    // Sensitivity presets
    const preset = cfg?.vadSensitivity ?? "medium";
    const BASE_START =
      preset === "high" ? 0.0025 : preset === "low" ? 0.004 : 0.003;
    const BASE_STOP =
      preset === "high" ? 0.0018 : preset === "low" ? 0.003 : 0.002;
    const START_FACTOR = preset === "high" ? 5.5 : preset === "low" ? 7.5 : 6.5;
    const STOP_FACTOR = preset === "high" ? 3.2 : preset === "low" ? 5.2 : 4.2;
    const SILENCE_MS = 1200; // wait longer after last speech before commit
    const MIN_VOICE_MS = 500; // require more speech before committing
    const ARMING_MS = 1400; // avoid early commits right after arming
    // Try AudioWorklet; fallback to ScriptProcessor if not available
    try {
      if (!(ctx as any).audioWorklet) throw new Error("no-worklet");
      const workletUrl = new URL(
        "worklets/pcmWorkletProcessor.js",
        (window as any).location?.href || "./"
      ).toString();
      await (ctx as any).audioWorklet.addModule(workletUrl);
      dbgState("worklet.loaded", { url: workletUrl });
      const node = (processorRef.current = new (window as any).AudioWorkletNode(
        ctx,
        "pcm-capture"
      ));
      source.connect(node as AudioWorkletNode);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      (node as AudioWorkletNode).connect(mute);
      mute.connect(ctx.destination);
      (node as AudioWorkletNode).port.onmessage = (ev: MessageEvent) => {
        if (!ev?.data || ev.data.type !== "frame") return;
        const rms = ev.data.rms as number;
        const buffer = new Float32Array(ev.data.buffer);
        // VU update (~30 fps)
        const displayRms = Math.min(1, rms * METER_GAIN);
        vuRef.current = 0.7 * vuRef.current + 0.3 * displayRms;
        const t = Date.now();
        if (t - (lastVuTsRef.current || 0) > 33) {
          lastVuTsRef.current = t;
          setVu(vuRef.current);
        }
        // Adaptive VAD
        const now = Date.now();
        noiseFloor = 0.995 * noiseFloor + 0.005 * rms;
        const START_THRESHOLD = Math.max(BASE_START, noiseFloor * START_FACTOR);
        const STOP_THRESHOLD = Math.max(BASE_STOP, noiseFloor * STOP_FACTOR);
        if (rms >= START_THRESHOLD) {
          if (!hadSpeech) firstVoiceTs = now;
          hadSpeech = true;
          lastVoiceTs = now;
          if (!isAwaitingRef.current && !isSpeakingRef.current) {
            dbgState("vad.start", {
              rms: +rms.toFixed(4),
              thr: +START_THRESHOLD.toFixed(4),
            });
          }
        }
        setVoiceActive(rms >= START_THRESHOLD);
        // Stream
        if (
          connectedRef.current &&
          !isAwaitingRef.current &&
          !isSpeakingRef.current
        ) {
          // Boost and send
          const boosted = new Float32Array(buffer.length);
          for (let i = 0; i < buffer.length; i++) {
            const v = Math.max(-1, Math.min(1, (buffer[i] ?? 0) * MIC_GAIN));
            boosted[i] = v;
          }
          // Resample to 24kHz for server transcription compatibility
          const resampledIn = resampleLinear(boosted, ctx.sampleRate, 24000);
          const int16 = floatTo16BitPCM(resampledIn);
          const raw = new Uint8Array(int16.buffer);
          const b64 = uint8ToBase64(raw);
          void window.electronAPI.realtime.appendAudioBase64(b64, 24000);
          if (hadSpeech && rms < STOP_THRESHOLD) {
            const silentFor = now - lastVoiceTs;
            const voicedFor = lastVoiceTs - firstVoiceTs;
            const armed = now - (startMicTsRef.current || 0) >= ARMING_MS;
            if (armed && voicedFor >= MIN_VOICE_MS && silentFor >= SILENCE_MS) {
              // Don’t stop the mic immediately; commit and let server VAD/response kick in.
              // We switch to awaiting only after commit is sent to avoid a brief idle state.
              hadSpeech = false;
              const snapshot = String(liveTranscript || "").trim();
              dbgState("vad.commit", {
                voicedFor,
                silentFor,
                snapshotLen: snapshot.length,
              });
              void commit(snapshot);
            }
          }
        }
      };
    } catch (e) {
      dbgState("worklet.failed_fallback", { error: String(e) });
      // Fallback ScriptProcessor (deprecated)
      const processor = (processorRef.current = ctx.createScriptProcessor(
        2048,
        1,
        1
      ));
      source.connect(processor as ScriptProcessorNode);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      (processor as ScriptProcessorNode).connect(mute);
      mute.connect(ctx.destination);
      (processor as ScriptProcessorNode).onaudioprocess = (e) => {
        // existing ScriptProcessor path unchanged
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          const vRaw = input[i] ?? 0;
          const v = Math.max(-1, Math.min(1, vRaw * MIC_GAIN));
          sum += v * v;
        }
        let rms = Math.sqrt(sum / Math.max(1, input.length));
        if (!isFinite(rms) || rms < 0) rms = 0;
        const displayRms = Math.min(1, rms * METER_GAIN);
        vuRef.current = 0.7 * vuRef.current + 0.3 * displayRms;
        const t = Date.now();
        if (t - (lastVuTsRef.current || 0) > 33) {
          lastVuTsRef.current = t;
          setVu(vuRef.current);
        }
        noiseFloor = 0.995 * noiseFloor + 0.005 * rms;
        const START_THRESHOLD = Math.max(BASE_START, noiseFloor * START_FACTOR);
        const STOP_THRESHOLD = Math.max(BASE_STOP, noiseFloor * STOP_FACTOR);
        const now = Date.now();
        if (rms >= START_THRESHOLD) {
          if (!hadSpeech) firstVoiceTs = now;
          hadSpeech = true;
          lastVoiceTs = now;
          if (!isAwaitingRef.current && !isSpeakingRef.current) {
            dbgState("vad.start.fallback", {
              rms: +rms.toFixed(4),
              thr: +START_THRESHOLD.toFixed(4),
            });
          }
        }
        setVoiceActive(rms >= START_THRESHOLD);
        if (
          connectedRef.current &&
          !isAwaitingRef.current &&
          !isSpeakingRef.current
        ) {
          const boosted = new Float32Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const v = Math.max(-1, Math.min(1, (input[i] ?? 0) * MIC_GAIN));
            boosted[i] = v;
          }
          const resampledIn = resampleLinear(boosted, ctx.sampleRate, 24000);
          const int16 = floatTo16BitPCM(resampledIn);
          const raw = new Uint8Array(int16.buffer);
          const b64 = uint8ToBase64(raw);
          void window.electronAPI.realtime.appendAudioBase64(b64, 24000);
          if (hadSpeech && rms < STOP_THRESHOLD) {
            const silentFor = now - lastVoiceTs;
            const voicedFor = lastVoiceTs - firstVoiceTs;
            const armed = now - (startMicTsRef.current || 0) >= ARMING_MS;
            if (armed && voicedFor >= MIN_VOICE_MS && silentFor >= SILENCE_MS) {
              hadSpeech = false;
              const snapshot2 = String(liveTranscript || "").trim();
              dbgState("vad.commit.fallback", {
                voicedFor,
                silentFor,
                snapshotLen: snapshot2.length,
              });
              void commit(snapshot2);
            }
          }
        }
      };
    }
    startMicTsRef.current = Date.now();
    dbgState("mic.armed", { t0: startMicTsRef.current });
    setIsStreaming(true);
    isStreamingRef.current = true;
    setLiveTranscript("");
  }, []);

  const stopMic = () => {
    try {
      (processorRef.current as ScriptProcessorNode)?.disconnect();
      sourceRef.current?.disconnect();
      audioCtxRef.current?.close();
    } catch {}
    processorRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;
    setIsStreaming(false);
    isStreamingRef.current = false;
    setVoiceActive(false);
    setVu(0);
    setLiveTranscript("");
  };

  const commit = async (textOrInstructions?: string) => {
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    // Enter awaiting now; mic can remain open until server responds, but UI will show Thinking
    beginAwaiting();
    const s = (textOrInstructions || "").trim();
    if (s) {
      await window.electronAPI.realtime.commit({ text: s });
    } else {
      await window.electronAPI.realtime.commit();
    }
  };

  return {
    connected,
    error,
    isStreaming,
    isAwaiting,
    isSpeaking,
    vu,
    voiceActive,
    liveTranscript,
    start,
    stop,
    startMic,
    stopMic,
    commit,
  } as const;
}
