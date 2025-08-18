import React, { useState, useRef, useEffect, useCallback } from "react";
import { useElectron } from "../hooks/useElectron";
import { useOpenAIRealtime } from "../hooks/useOpenAIRealtime";

import MicIcon from "../assets/icons/mic.svg";
import StopIcon from "../assets/icons/stop.svg";
import SendIcon from "../assets/icons/send.svg";

interface MessageInputProps {
  onSendMessage: (message: string, type?: "text" | "voice") => void;
  disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
}) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toolCache, setToolCache] = useState<Record<string, any[]>>({});
  const [loadingTools, setLoadingTools] = useState(false);
  const {
    isElectronAvailable,
    startVoiceRecording: startElectronRecording,
    stopVoiceRecording: stopElectronRecording,
  } = useElectron();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const realtime = useOpenAIRealtime();

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

  const handleVoiceRecord = async () => {
    if (!isRecording) {
      // Start recording
      try {
        setIsRecording(true);
        await startLocalRecording();
      } catch (error) {
        console.error("Failed to start recording:", error);
        setIsRecording(false);
      }
    } else {
      // Stop recording
      try {
        await stopLocalRecording();
      } catch (error) {
        console.error("Failed to stop recording:", error);
      }
    }
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="message-input-container">
      {realtime.connected && (realtime.isStreaming || realtime.isAwaiting) && realtime.liveTranscript && (
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
          }}
          title={realtime.liveTranscript}
        >
          {realtime.liveTranscript}
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

          <button
            type="button"
            onClick={handleVoiceRecord}
            className={`voice-record-btn ${isRecording ? "recording" : ""}`}
            disabled={disabled}
            title={
              isRecording
                ? "Stop local STT recording"
                : "Start local STT recording"
            }
          >
            <img
              src={isRecording ? StopIcon : MicIcon}
              alt={isRecording ? "Stop STT" : "STT Mic"}
              width={20}
              height={20}
            />
            <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.8 }}>
              STT
            </span>
          </button>

          {/* Realtime Live button (OpenAI Realtime speech-to-speech) */}
          <button
            type="button"
            onClick={async () => {
              try {
                if (!realtime.connected) {
                  const res = await realtime.start({ voice: "verse" });
                  // startMic only after we see connected state flip via event
                  setTimeout(() => {
                    if (realtime.connected) void realtime.startMic();
                  }, 50);
                } else {
                  // Stop mic, commit buffer, and stop session
                  realtime.stopMic();
                  await realtime.commit();
                  await realtime.stop();
                }
              } catch (e) {
                console.error("Realtime start/stop failed", e);
              }
            }}
            className={`voice-record-btn ${
              realtime.connected ? "recording" : ""
            }`}
            disabled={disabled}
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
              {!realtime.connected
                ? "Live"
                : realtime.isSpeaking
                ? "Speaking"
                : realtime.isAwaiting
                ? "Thinking"
                : realtime.isStreaming
                ? "Listening"
                : "Live"}
            </span>
            {realtime.connected && (
              <div
                title={`Input level: ${(Math.min(1, Math.max(0, realtime.vu)) * 100).toFixed(0)}%`}
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
                    width: `${Math.min(100, Math.round((realtime.vu || 0) * 200))}%`,
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
