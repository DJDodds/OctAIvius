import React, { useState, useEffect, useRef, Suspense } from "react";
import Header from "./components/Header";
import ChatContainer from "./components/ChatContainer";
import MessageInput from "./components/MessageInput";
const SettingsPanel = React.lazy(() => import("./components/SettingsPanel"));
const MCPPanel = React.lazy(() => import("./components/MCPPanel"));
import LoadingScreen from "./components/LoadingScreen";
import { Message, AppSettings } from "./types";
import { useElectron } from "./hooks/useElectron";
import RealtimeDebugOverlay from "./components/RealtimeDebugOverlay";
import ProgressPane from "./components/ProgressPane";

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  // Voice input is always available; no toggle needed
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMCPPanelOpen, setIsMCPPanelOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingStep, setTypingStep] = useState<string | undefined>(undefined);
  const [typingState, setTypingState] = useState<string | undefined>(undefined);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    aiProvider: "gemini",
    voiceEnabled: false,
    debugMode: false,
    theme: "dark",
    micBoost: 2,
    vadSensitivity: "medium",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    isElectronAvailable,
    sendMessage: sendElectronMessage,
    startVoiceRecording,
    stopVoiceRecording,
    clearConversation,
    getConversationHistory,
  } = useElectron();

  useEffect(() => {
    // Initialize app
    initializeApp();
  }, []);

  // Progress updates from main
  useEffect(() => {
    if (!isElectronAvailable || !window?.electronAPI?.chat?.onProgress) return;
    const off = window.electronAPI.chat.onProgress((payload) => {
      try {
        if (!payload) return;
        setTypingStep(payload.step);
        setTypingState(payload.state);
        if (payload.state === "done" || payload.state === "error") {
          setTimeout(() => {
            setTypingStep(undefined);
            setTypingState(undefined);
          }, 800);
        }

        // Mirror select progress steps into the chat as compact assistant messages
        const formatPreview = (v: any, max = 200) => {
          try {
            const s = typeof v === "string" ? v : JSON.stringify(v);
            return s.length > max ? s.slice(0, max) + "…" : s;
          } catch {
            return String(v);
          }
        };

        const toChatLine = (e: {
          step: string;
          state: "start" | "done" | "error";
          info?: any;
          ts: number;
          opId?: string;
        }): string | null => {
          const { step, state, info } = e;
          const stateTag =
            state === "start" ? "…" : state === "done" ? "✓" : "✗";
          // Prefer concise, human-friendly lines per step
          switch (step) {
            case "mcp-connect":
              return `MCP connect ${stateTag}`;
            case "refresh-schemas":
              return `Refresh AMPP schemas ${stateTag}`;
            case "tools-call": {
              const name = info?.tool || info?.name || "tool";
              const ar = info?.args ? formatPreview(info.args, 140) : undefined;
              return ar
                ? `Tool ${name} ${stateTag} args=${ar}`
                : `Tool ${name} ${stateTag}`;
            }
            case "param-scan": {
              const p = info?.param || info?.target || info?.query;
              const app = info?.app || info?.application;
              return `Scan parameters for ${app || "app"} "${
                p || ""
              }" ${stateTag}`;
            }
            case "param-candidates": {
              const cmds = Array.isArray(info?.commands) ? info.commands : [];
              return cmds.length
                ? `Candidate commands (${cmds.length}): ${formatPreview(
                    cmds,
                    140
                  )} ${stateTag}`
                : `Candidate commands ${stateTag}`;
            }
            case "param-scan-cmd": {
              const idx = info?.index ?? info?.i;
              const total = info?.total ?? info?.n;
              const cmd = info?.command || info?.cmd;
              const params = Array.isArray(info?.params)
                ? info.params.slice(0, 6)
                : undefined;
              const suffix = params
                ? ` params=${formatPreview(params, 120)}`
                : "";
              return `Scan ${
                cmd || "command"
              } (${idx}/${total}) ${stateTag}${suffix}`;
            }
            case "param-matches": {
              const matches = Array.isArray(info?.matches) ? info.matches : [];
              return matches.length
                ? `Matched parameters: ${formatPreview(
                    matches,
                    160
                  )} ${stateTag}`
                : `No parameter matches ${stateTag}`;
            }
            case "param-suggestions": {
              const sug = Array.isArray(info?.suggestions)
                ? info.suggestions.slice(0, 8)
                : [];
              return sug.length
                ? `Closest parameters: ${formatPreview(sug, 160)} ${stateTag}`
                : `No close parameters found ${stateTag}`;
            }
            case "param-chosen": {
              const cmd = info?.command || info?.cmd;
              const key = info?.paramKey || info?.key;
              return `Chosen ${cmd || "command"} param ${
                key || "?"
              } ${stateTag}`;
            }
            case "payload-suggest":
              return `Suggesting payload ${stateTag}`;
            case "payload-override": {
              const key = info?.key || info?.paramKey;
              const val = info?.value ?? info?.to;
              return `Set ${key || "param"} = ${formatPreview(
                val,
                120
              )} ${stateTag}`;
            }
            case "invoke-args": {
              const app = info?.application || info?.app;
              const cmd = info?.command || info?.cmd;
              const wl = info?.workload || info?.workloadName || info?.name;
              const payloadObj = info?.payload || {};
              const json = (() => {
                try {
                  return JSON.stringify(payloadObj);
                } catch {
                  return String(payloadObj);
                }
              })();
              return `Invoke ${app || "App"}.${cmd || "cmd"} for "${
                wl || "?"
              }" payload=${json} ${stateTag}`;
            }
            case "invoke-attempt": {
              const attempt = info?.attempt || info?.try || 1;
              const reason = info?.reason
                ? ` reason=${formatPreview(info.reason, 120)}`
                : "";
              return `Invoke attempt ${attempt} ${stateTag}${reason}`;
            }
            case "invoke-retry": {
              const reason = info?.reason
                ? ` (${formatPreview(info.reason, 140)})`
                : "";
              return `Retry invoke${reason} ${stateTag}`;
            }
            case "guidance": {
              const text = info?.text || info;
              return typeof text === "string" ? text : formatPreview(text, 180);
            }
            default:
              return null;
          }
        };

        const line = toChatLine(payload);
        if (line) {
          const assistantMessage: Message = {
            id: (Date.now() + Math.random()).toString(),
            content: line,
            sender: "assistant",
            timestamp: new Date(),
            type: "text",
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
      } catch {}
    });
    return () => {
      try {
        if (typeof off === "function") off();
      } catch {}
    };
  }, [isElectronAvailable]);

  // Listen for assistant messages that come from main (e.g., Realtime transcript pipeline)
  useEffect(() => {
    if (!isElectronAvailable || !window.electronAPI?.chat?.onAssistantMessage)
      return;
    const off = window.electronAPI.chat.onAssistantMessage(
      ({ content, source }) => {
        if (!content) return;
        const assistantMessage: Message = {
          id: (Date.now() + Math.random()).toString(),
          content,
          sender: "assistant",
          timestamp: new Date(),
          type: "text",
        };
        setMessages((prev) => [...prev, assistantMessage]);
        // Don't speak here; realtime pipeline already plays audio
      }
    );
    return () => {
      try {
        if (typeof off === "function") off();
      } catch {}
    };
  }, [isElectronAvailable]);

  useEffect(() => {
    // Auto scroll to bottom when new messages arrive
    scrollToBottom();
  }, [messages]);

  // Listen for MCP server status updates to surface a short chat notice
  useEffect(() => {
    if (!isElectronAvailable || !window.electronAPI?.mcp?.onServersUpdated)
      return;
    const off = window.electronAPI.mcp.onServersUpdated(
      async ({ serverId, status }) => {
        if (serverId !== "ampp") return;
        if (status === "connected") {
          // Show a brief system message that schemas are bootstrapping
          const msgId = `sys_${Date.now()}`;
          const sysMessage: Message = {
            id: msgId,
            content:
              "Connecting to AMPP MCP Server… bootstrapping schemas and loading tools…",
            sender: "assistant",
            timestamp: new Date(),
            type: "text",
          };
          setMessages((prev) => [...prev, sysMessage]);
          setPendingNotice(msgId);
          // Safety timeout to avoid a stuck message
          const safetyId = setTimeout(() => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      content:
                        "Still loading MCP tools… If this takes too long, try closing and reopening the MCP panel or reconnecting.",
                    }
                  : m
              )
            );
          }, 20000);
          // Proactively ask main to list tools to detect when loading completes
          try {
            await window.electronAPI.mcp.listTools("ampp");
          } catch {}
          // Replace the notice with a confirmation line
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    content:
                      "Schemas refreshed and tools loaded. You can now ask for AMPP commands or ClipPlayer controls.",
                  }
                : m
            )
          );
          setPendingNotice(null);
          try {
            clearTimeout(safetyId);
          } catch {}
        }
      }
    );
    return () => {
      try {
        if (typeof off === "function") off();
      } catch {}
    };
  }, [isElectronAvailable]);

  const initializeApp = async () => {
    try {
      // Simulate initialization delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Load conversation history if available
      if (isElectronAvailable) {
        try {
          const history = await getConversationHistory();
          if (history && history.length > 0) {
            setMessages(history);
          } else {
            // Add welcome message if no history
            addWelcomeMessage();
          }
        } catch (error) {
          console.error("Failed to load conversation history:", error);
          addWelcomeMessage();
        }
      } else {
        addWelcomeMessage();
      }

      setIsConnected(true);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to initialize app:", error);
      setIsLoading(false);
    }
  };

  const addWelcomeMessage = () => {
    const welcomeMessage: Message = {
      id: Date.now().toString(),
      content: "Hi, I'm OctAIvius. How can I help you today?",
      sender: "assistant",
      timestamp: new Date(),
      type: "text",
    };
    setMessages([welcomeMessage]);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (
    content: string,
    type: "text" | "voice" = "text"
  ) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      sender: "user",
      timestamp: new Date(),
      type,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    try {
      let response: string;

      if (isElectronAvailable) {
        // If we are still waiting on MCP tools, echo a short waiting message in chat
        if (pendingNotice) {
          setMessages((prev) => [
            ...prev,
            {
              id: `sys_wait_${Date.now()}`,
              content: "Still loading MCP tools… please wait a moment.",
              sender: "assistant",
              timestamp: new Date(),
              type: "text",
            },
          ]);
        }
        response = await sendElectronMessage(content);
      } else {
        response = await simulateAIResponse(content);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response,
        sender: "assistant",
        timestamp: new Date(),
        type: "text",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // No local TTS for standard chat replies; only Realtime bot should produce audio.
    } catch (error) {
      console.error("Failed to get AI response:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content:
          "Sorry, I'm having trouble responding right now. Please try again.",
        sender: "assistant",
        timestamp: new Date(),
        type: "text",
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const simulateAIResponse = async (userMessage: string): Promise<string> => {
    // Simulate thinking time
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 2000)
    );

    // Simple response logic (replace with actual IPC call to AI service)
    const responses = [
      "That's an interesting question. Let me think about that...",
      "I understand what you're asking. Here's my perspective on that:",
      "Great question! Based on what you've said, I think:",
      "I can definitely help with that. Here's what I suggest:",
      "That's a complex topic. Let me break it down for you:",
    ];

    const randomResponse =
      responses[Math.floor(Math.random() * responses.length)];
    return `${randomResponse} This is a simulated response to: "${userMessage}"`;
  };

  // Voice toggle removed

  const handleSettingsToggle = () => {
    setIsSettingsOpen(!isSettingsOpen);
  };

  const handleMCPToggle = () => {
    setIsMCPPanelOpen(!isMCPPanelOpen);
  };

  const handleSettingsChange = (newSettings: Partial<AppSettings>) => {
    setSettings((prev: AppSettings) => ({ ...prev, ...newSettings }));
  };

  const handleClearChat = async () => {
    if (isElectronAvailable) {
      try {
        await clearConversation();
      } catch (error) {
        console.error("Failed to clear conversation:", error);
      }
    }
    setMessages([]);
    addWelcomeMessage();
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className={`app ${settings.theme}`}>
      <Header
        isConnected={isConnected}
        isMcpLoading={!!pendingNotice}
        onSettingsToggle={handleSettingsToggle}
        onClearChat={handleClearChat}
        onMCPToggle={handleMCPToggle}
        isMCPPanelOpen={isMCPPanelOpen}
      />

      <main className="app-main">
        <ChatContainer
          messages={messages}
          isTyping={isTyping}
          typingStep={typingStep}
          typingState={typingState}
          messagesEndRef={messagesEndRef}
        />

        <MessageInput
          onSendMessage={handleSendMessage}
          disabled={!isConnected}
          micBoost={settings.micBoost}
          vadSensitivity={settings.vadSensitivity}
        />
      </main>

      <Suspense fallback={null}>
        {isSettingsOpen && (
          <SettingsPanel
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onClose={handleSettingsToggle}
          />
        )}
        {isMCPPanelOpen && <MCPPanel onClose={handleMCPToggle} />}
      </Suspense>

      {settings.debugMode && (
        <>
          <RealtimeDebugOverlay />
          <ProgressPane />
        </>
      )}
    </div>
  );
};

export default App;
