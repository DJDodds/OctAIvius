import React, { useState, useRef, useEffect, useCallback } from "react";
import { useElectron } from "../hooks/useElectron";
import { useOpenAIRealtime } from "../hooks/useOpenAIRealtime";

import MicIcon from "../assets/icons/mic.svg";
import StopIcon from "../assets/icons/stop.svg";
import SendIcon from "../assets/icons/send.svg";

interface MessageInputProps {
  onSendMessage: (message: string, type?: "text" | "voice") => void;
  disabled?: boolean;
  micBoost?: number | undefined;
  vadSensitivity?: "low" | "medium" | "high" | undefined;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
  micBoost = 2,
  vadSensitivity = "medium",
}) => {
  const [message, setMessage] = useState("");
  // Simplify UI: disable local STT path; only keep Live button
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toolCache, setToolCache] = useState<Record<string, any[]>>({});
  const [loadingTools, setLoadingTools] = useState(false);
  // Simple client-side history for sent messages
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const draftRef = useRef<string>("");
  const {
    isElectronAvailable,
    startVoiceRecording: startElectronRecording,
    stopVoiceRecording: stopElectronRecording,
  } = useElectron();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const realtime = useOpenAIRealtime({ micBoost, vadSensitivity });

  useEffect(() => {
    // Mirror minimal state to console for file capture
    const id = setInterval(() => {
      try {
        console.log(
          `[realtime:ui] c=${realtime.connected} s=${realtime.isStreaming} a=${
            realtime.isAwaiting
          } p=${realtime.isSpeaking} vu=${realtime.vu.toFixed(2)}`
        );
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [realtime]);

  // Load saved history on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chat.history");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr))
          setHistory(arr.filter((s) => typeof s === "string"));
      }
    } catch {}
  }, []);

  const persistHistory = (items: string[]) => {
    try {
      localStorage.setItem("chat.history", JSON.stringify(items.slice(-200)));
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // If suggestions are open and an item is selected, accept it instead of sending
    if (showSuggestions && suggestions.length > 0) {
      const sel =
        suggestions[
          Math.max(0, Math.min(selectedIndex, suggestions.length - 1))
        ];
      if (sel) applySuggestion(sel);
      return;
    }
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      // Push to history (dedupe adjacent)
      setHistory((prev) => {
        const next =
          prev[prev.length - 1] === message.trim()
            ? prev
            : [...prev, message.trim()];
        persistHistory(next);
        return next;
      });
      setHistoryIndex(null);
      draftRef.current = "";
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Navigation for suggestions
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (i) => (i - 1 + suggestions.length) % suggestions.length
        );
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const sel =
          suggestions[
            Math.max(0, Math.min(selectedIndex, suggestions.length - 1))
          ];
        if (sel) applySuggestion(sel);
        return;
      }
    }

    // Up/Down history navigation when not using suggestions
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const ta = textareaRef.current;
      const caretAtStart = ta
        ? ta.selectionStart === 0 && ta.selectionEnd === 0
        : false;
      const caretAtEnd = ta
        ? ta.selectionStart === message.length &&
          ta.selectionEnd === message.length
        : false;
      const isArrowUp = e.key === "ArrowUp";

      // Only trigger history when input is empty or caret at the respective boundary
      if (
        (isArrowUp && (message.length === 0 || caretAtStart)) ||
        (!isArrowUp && historyIndex !== null)
      ) {
        e.preventDefault();
        setHistoryIndex((idx) => {
          let nextIdx: number | null = idx;
          if (idx === null) {
            // Entering history browsing: store current draft
            draftRef.current = message;
            nextIdx = history.length - 1;
          } else {
            if (isArrowUp) nextIdx = Math.max(0, idx - 1);
            else nextIdx = idx + 1;
            if (nextIdx >= history.length) nextIdx = null; // exit history to draft/empty
          }
          const nextMessage =
            nextIdx === null ? draftRef.current : history[nextIdx] ?? "";
          setMessage(nextMessage);
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              const el = textareaRef.current;
              el.selectionStart = el.selectionEnd = nextMessage.length;
              el.style.height = "auto";
            }
          });
          return nextIdx;
        });
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const ensureTools = useCallback(
    async (serverId: string) => {
      if (!window.electronAPI?.mcp?.listTools) return [] as any[];
      if (toolCache[serverId]?.length) return toolCache[serverId];
      try {
        setLoadingTools(true);
        const res = await window.electronAPI.mcp.listTools(serverId);
        const tools = res?.success ? res.tools || [] : [];
        setToolCache((m) => ({ ...m, [serverId]: tools }));
        return tools;
      } catch {
        return [] as any[];
      } finally {
        setLoadingTools(false);
      }
    },
    [toolCache]
  );

  const makeSuggestions = useCallback(
    async (text: string) => {
      const trimmed = text.trimStart();
      // Only load the suggestion engine when a slash is typed
      if (!trimmed.startsWith("/")) {
        setShowSuggestions(false);
        setSuggestions([]);
        return;
      }
      try {
        const mod = await import("../utils/suggestionEngine");
        const list = await mod.getSuggestions(text, ensureTools);
        setSuggestions(list);
        setShowSuggestions(list.length > 0);
        setSelectedIndex(0);
      } catch (e) {
        // Fallback: hide suggestions on failure
        setShowSuggestions(false);
        setSuggestions([]);
      }
    },
    [ensureTools]
  );

  useEffect(() => {
    void makeSuggestions(message);
  }, [message, makeSuggestions]);

  const applySuggestion = (s: any) => {
    setMessage(s.insertText);
    // Move cursor to end and resize
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd =
          s.insertText.length;
        textareaRef.current.focus();
        textareaRef.current.style.height = "auto";
      }
    });
    setShowSuggestions(false);
  };

  const startLocalRecording = async () => {
    // Stop any ongoing TTS (barge-in)
    try {
      if (window?.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
      }
    } catch {}

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    } as any;

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    mediaStreamRef.current = stream;

    const mimeCandidates = [
      "audio/webm;codecs=opus",
      "audio/webm; codecs=opus",
      "audio/webm",
    ];
    let mimeType = "";
    for (const m of mimeCandidates) {
      if ((window as any).MediaRecorder && MediaRecorder.isTypeSupported(m)) {
        mimeType = m;
        break;
      }
    }

    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = rec;
    chunksRef.current = [];

    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = async () => {
      try {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        const buf = await blob.arrayBuffer();
        const res = await window.electronAPI.voice.processAudio(buf);
        if (!res?.success) {
          console.error("STT failed:", res?.error);
        }
        const transcript = res?.success ? res.result : "";
        if (transcript && transcript.trim()) {
          onSendMessage(transcript.trim(), "voice");
        } else if (!res?.success) {
          // Show error as assistant message to make it visible
          onSendMessage(
            `(Speech recognition error) ${res.error || "Unknown error"}`
          );
        } else {
          console.warn("No transcript returned from STT");
        }
      } catch (err) {
        console.error("Failed to process recorded audio:", err);
        onSendMessage(
          "(Speech capture error) Unable to process recorded audio."
        );
      } finally {
        // Cleanup tracks
        try {
          mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        } catch {}
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        chunksRef.current = [];
      }
    };

    rec.start(100); // collect small chunks
  };

  const stopLocalRecording = async () => {
    try {
      mediaRecorderRef.current?.stop();
    } catch {}
    setIsRecording(false);
  };

  // Disable local STT mic button behavior (Live covers the voice use case)
  const handleVoiceRecord = async () => {
    /* disabled */
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="message-input-container">
      {realtime.connected && (
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 16,
            right: 16,
            padding: "6px 10px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--border, #333)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-secondary, #bbb)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
            zIndex: 1000,
          }}
          title={
            realtime.liveTranscript ||
            (realtime.isSpeaking
              ? "Speaking…"
              : realtime.isAwaiting
              ? "Thinking…"
              : realtime.isStreaming
              ? "Listening…"
              : "Live")
          }
        >
          {realtime.liveTranscript ||
            (realtime.isSpeaking
              ? "Speaking…"
              : realtime.isAwaiting
              ? "Thinking…"
              : realtime.isStreaming
              ? "Listening…"
              : "Live")}
        </div>
      )}
      <form onSubmit={handleSubmit} className="message-form">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Connecting..." : "Type your message..."}
            disabled={disabled}
            rows={1}
            className="message-textarea"
          />

          {showSuggestions && suggestions.length > 0 && (
            <div
              className="suggestions"
              role="listbox"
              aria-label="Suggestions"
              style={{
                position: "absolute",
                bottom: "56px",
                left: "12px",
                right: "12px",
                background: "var(--bg-primary, #111)",
                border: "1px solid var(--border, #333)",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                maxHeight: 220,
                overflowY: "auto",
                zIndex: 20,
              }}
            >
              {suggestions.map((s, i) => (
                <div
                  key={s.label + i}
                  role="option"
                  aria-selected={i === selectedIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(s);
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "8px 10px",
                    cursor: "pointer",
                    background:
                      i === selectedIndex
                        ? "var(--bg-elevated, #1b1b1b)"
                        : "transparent",
                  }}
                >
                  <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                    {s.label}
                  </div>
                  {s.detail && (
                    <div
                      style={{
                        color: "var(--text-secondary, #aaa)",
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {s.detail}
                    </div>
                  )}
                </div>
              ))}
              {loadingTools && (
                <div
                  style={{
                    padding: 8,
                    color: "var(--text-secondary, #aaa)",
                    fontSize: 12,
                  }}
                >
                  Loading tools…
                </div>
              )}
            </div>
          )}

          {/* Local STT button removed to keep only the Live flow */}

          {/* Realtime Live button (OpenAI Realtime speech-to-speech) */}
          <button
            type="button"
            onClick={async () => {
              try {
                // Simple on/off toggle:
                // - If OFF: connect and let hook auto-arm mic
                // - If ON: fully stop session, mic, and playback
                if (!realtime.connected) {
                  await realtime.start({ voice: "verse" });
                } else {
                  await realtime.stop();
                }
              } catch (e) {
                console.error("Realtime toggle failed", e);
              }
            }}
            className={`voice-record-btn ${
              realtime.connected ? "recording" : ""
            }`}
            disabled={false}
            title={
              !realtime.connected
                ? "Start Realtime streaming"
                : realtime.isSpeaking
                ? "Speaking (playing response)"
                : realtime.isAwaiting
                ? "Thinking (preparing answer)"
                : realtime.isStreaming
                ? "Listening (capturing mic)"
                : "Realtime connected"
            }
            aria-label={
              !realtime.connected
                ? "Start Realtime streaming"
                : realtime.isSpeaking
                ? "Realtime speaking"
                : realtime.isAwaiting
                ? "Realtime thinking"
                : realtime.isStreaming
                ? "Realtime listening"
                : "Realtime connected"
            }
          >
            <img
              src={realtime.connected ? StopIcon : MicIcon}
              alt={realtime.connected ? "Stop Realtime" : "Realtime Mic"}
              width={20}
              height={20}
            />
            <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.85 }}>
              {!realtime.connected ? "Live" : "Stop"}
            </span>
            {realtime.connected && (
              <div
                title={`Input level: ${(
                  Math.min(1, Math.max(0, realtime.vu)) * 100
                ).toFixed(0)}%`}
                aria-label="Realtime input level"
                style={{
                  marginLeft: 8,
                  width: 36,
                  height: 6,
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                  alignSelf: "center",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((realtime.vu || 0) * 200)
                    )}%`,
                    height: "100%",
                    background: realtime.voiceActive ? "#22c55e" : "#888",
                    transition: "width 50ms linear, background 120ms ease",
                  }}
                />
              </div>
            )}
          </button>

          <button
            type="submit"
            disabled={!message.trim() || disabled}
            className="send-btn"
            title="Send message"
            aria-label="Send message"
          >
            <img src={SendIcon} alt="Send" width={20} height={20} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default MessageInput;
