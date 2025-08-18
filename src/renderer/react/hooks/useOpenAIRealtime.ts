import { useEffect, useRef, useState, useCallback } from "react";

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

export function useOpenAIRealtime() {
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

  const clearAwaitingTimer = useCallback(() => {
    if (awaitingTimerRef.current) {
      clearTimeout(awaitingTimerRef.current);
      awaitingTimerRef.current = null;
    }
  }, []);

  const beginAwaiting = useCallback(() => {
    setIsAwaiting(true);
    isAwaitingRef.current = true;
    clearAwaitingTimer();
    // Safety timeout: if no audio or completion arrives, exit thinking and restart listening
    awaitingTimerRef.current = setTimeout(() => {
      if (isAwaitingRef.current && !isSpeakingRef.current) {
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
            void startMic();
          }
        }, 100);
      }
    }, 8000);
  }, [clearAwaitingTimer]);

  useEffect(() => {
    const off = window.electronAPI.realtime.onEvent((ev) => {
      if (ev?.type === "realtime.status") {
        const isConn = ev.status === "connected";
        setConnected(isConn);
        connectedRef.current = isConn;
        if (ev.status === "error") setError(ev.error || "Realtime error");
        if (ev.status !== "connected") {
          setIsStreaming(false);
          setIsAwaiting(false);
          setIsSpeaking(false);
          isStreamingRef.current = false;
          isAwaitingRef.current = false;
          isSpeakingRef.current = false;
          clearAwaitingTimer();
          setVoiceActive(false);
          setVu(0);
          vuRef.current = 0;
          setLiveTranscript("");
        } else {
          // Auto-start listening on connect if idle
          if (!isStreamingRef.current && !isAwaitingRef.current && !isSpeakingRef.current) {
            setTimeout(() => { void startMic(); }, 50);
          }
        }
      } else if (ev?.type === "output.audio.delta") {
        // Base64 PCM16 from server — queue for playback
        try {
          // entering speaking state on first delta
          setIsSpeaking(true);
          setIsAwaiting(false);
          isSpeakingRef.current = true;
          isAwaitingRef.current = false;
          clearAwaitingTimer();
          const u8 = base64ToUint8Array(ev.audio);
          const int16 = new Int16Array(
            u8.buffer,
            u8.byteOffset,
            Math.floor(u8.byteLength / 2)
          );
          const ctx = (playbackCtxRef.current ||= new AudioContext({
            sampleRate: ev.sampleRate || 24000,
          }));
          // Convert Int16 to Float32 for WebAudio
          const f32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            const v = int16[i] ?? 0;
            f32[i] = v / 0x8000;
          }
          const audioBuf = ctx.createBuffer(1, f32.length, ctx.sampleRate);
          audioBuf.getChannelData(0).set(f32);
          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(ctx.destination);
          src.start();
          playbackNodeRef.current = src;
        } catch (e) {
          console.warn("Failed to play realtime audio delta", e);
        }
  } else if (ev?.type === "output.completed") {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
  clearAwaitingTimer();
        // Clear transcript shortly after speaking completes
        setTimeout(() => setLiveTranscript(""), 250);
        // keep connected state; if you want auto-disconnect, handle in ui
        // Auto-restart listening if still connected
        setTimeout(() => {
          if (
            connectedRef.current &&
            !isStreamingRef.current &&
            !isAwaitingRef.current &&
            !isSpeakingRef.current
          ) {
            void startMic();
          }
        }, 150);
      } else if (
        ev?.type === "realtime.message" &&
        ev?.data?.type === "response.created"
      ) {
        // In case a response is created by other triggers, show thinking
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        beginAwaiting();
      } else if (
        ev?.type === "realtime.message" &&
        ev?.data?.type === "response.completed"
      ) {
        // No audio was produced, or text finished; clear thinking
        setIsAwaiting(false);
        isAwaitingRef.current = false;
        clearAwaitingTimer();
        // Optionally restart listening
        setTimeout(() => {
          if (
            connectedRef.current &&
            !isStreamingRef.current &&
            !isAwaitingRef.current &&
            !isSpeakingRef.current
          ) {
            void startMic();
          }
        }, 150);
      } else if (ev?.type === "realtime.transcript.delta") {
        const delta = typeof ev.text === "string" ? ev.text : "";
        if (delta) setLiveTranscript((s) => (s + delta).slice(-800));
      } else if (ev?.type === "realtime.transcript") {
        const full = typeof ev.text === "string" ? ev.text : "";
        if (full) setLiveTranscript(full);
      }
    });
    return () => off();
  }, []);

  const start = async (opts?: { model?: string; voice?: string }) => {
    setError(null);
    await window.electronAPI.realtime.start(opts);
  };

  const stop = async () => {
    await window.electronAPI.realtime.stop();
    setConnected(false);
    setIsStreaming(false);
    setIsAwaiting(false);
    setIsSpeaking(false);
    connectedRef.current = false;
    isStreamingRef.current = false;
    isAwaitingRef.current = false;
    isSpeakingRef.current = false;
  };

  const startMic = useCallback(async () => {
    if (isStreamingRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } as any,
      video: false as any,
    });
    const ctx = (audioCtxRef.current ||= new AudioContext());
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch {}
    }
    const source = (sourceRef.current = ctx.createMediaStreamSource(stream));
    const processor = (processorRef.current = ctx.createScriptProcessor(
      2048,
      1,
      1
    ));
    source.connect(processor as ScriptProcessorNode);
  // Keep node active but muted to avoid feedback
  const mute = ctx.createGain();
  mute.gain.value = 0;
  (processor as ScriptProcessorNode).connect(mute);
  mute.connect(ctx.destination);
    setIsStreaming(true);
    isStreamingRef.current = true;
  setLiveTranscript("");
  // Simple VAD variables
  let hadSpeech = false;
  let firstVoiceTs = 0;
  let lastVoiceTs = Date.now();
  const START_THRESHOLD = 0.0045; // slightly lower for easier detection
  const STOP_THRESHOLD = 0.0035; // lower to end
  const SILENCE_MS = 700;
  const MAX_UTTER_MS = 7000; // hard-stop long utterances

    (processor as ScriptProcessorNode).onaudioprocess = (e) => {
      // Always compute meter for UI
      const input = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        const v = input[i] ?? 0;
        sum += v * v;
      }
  let rms = Math.sqrt(sum / Math.max(1, input.length));
  // Clamp to sane range
  if (!isFinite(rms) || rms < 0) rms = 0;
      // Smooth VU update (~20 fps) to UI
      vuRef.current = 0.85 * vuRef.current + 0.15 * rms;
      const t = Date.now();
      if (t - (lastVuTsRef.current || 0) > 50) {
        lastVuTsRef.current = t;
        setVu(vuRef.current);
      }

      const now = Date.now();
      if (rms >= START_THRESHOLD) {
        if (!hadSpeech) firstVoiceTs = now;
        hadSpeech = true;
        lastVoiceTs = now;
      }
      setVoiceActive(rms >= START_THRESHOLD);

      // Only stream and VAD when connected and in listening state
      if (connectedRef.current && !isAwaitingRef.current && !isSpeakingRef.current) {
        const int16 = floatTo16BitPCM(input);
        const raw = new Uint8Array(int16.buffer);
        const b64 = uint8ToBase64(raw);
        void window.electronAPI.realtime.appendAudioBase64(b64, ctx.sampleRate);

        // If we already heard speech and then silence persists or max duration reached, auto-commit
        if (hadSpeech && (rms < STOP_THRESHOLD)) {
          const silentFor = now - lastVoiceTs;
          const utterFor = now - firstVoiceTs;
          if (silentFor >= SILENCE_MS || utterFor >= MAX_UTTER_MS) {
            // stop streaming and commit
            setIsStreaming(false);
            isStreamingRef.current = false;
            try {
              (processorRef.current as ScriptProcessorNode)?.disconnect();
              sourceRef.current?.disconnect();
              audioCtxRef.current?.close();
            } catch {}
            processorRef.current = null;
            sourceRef.current = null;
            audioCtxRef.current = null;
            hadSpeech = false;
            beginAwaiting();
            void window.electronAPI.realtime.commit();
          }
        }
      }
    };
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

  const commit = async (instructions?: string) => {
  setIsSpeaking(false);
  isSpeakingRef.current = false;
  beginAwaiting();
    await window.electronAPI.realtime.commit(
      instructions ? { instructions } : undefined
    );
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
