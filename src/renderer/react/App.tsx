import React, { useState, useEffect, useRef, Suspense } from "react";
import Header from "./components/Header";
import ChatContainer from "./components/ChatContainer";
import MessageInput from "./components/MessageInput";
const SettingsPanel = React.lazy(() => import("./components/SettingsPanel"));
const MCPPanel = React.lazy(() => import("./components/MCPPanel"));
import LoadingScreen from "./components/LoadingScreen";
import { Message, AppSettings } from "./types";
import { useElectron } from "./hooks/useElectron";

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMCPPanelOpen, setIsMCPPanelOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    aiProvider: "gemini",
    voiceEnabled: false,
    debugMode: false,
    theme: "dark",
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

  useEffect(() => {
    // Auto scroll to bottom when new messages arrive
    scrollToBottom();
  }, [messages]);

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
      content: "Hello! I'm your AI assistant. How can I help you today?",
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

      // Simple TTS: speak the assistant response if voice is enabled
      if (
        isVoiceEnabled &&
        typeof window !== "undefined" &&
        "speechSynthesis" in window
      ) {
        try {
          const utter = new SpeechSynthesisUtterance(response);
          utter.rate = 1.0;
          utter.pitch = 1.0;
          utter.onstart = () => {
            // If user starts talking, cancel in MessageInput
          };
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        } catch {}
      }
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

  const handleVoiceToggle = () => {
    setIsVoiceEnabled(!isVoiceEnabled);
    setSettings((prev: AppSettings) => ({
      ...prev,
      voiceEnabled: !isVoiceEnabled,
    }));
  };

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
        isVoiceEnabled={isVoiceEnabled}
        onVoiceToggle={handleVoiceToggle}
        onSettingsToggle={handleSettingsToggle}
        onClearChat={handleClearChat}
        onMCPToggle={handleMCPToggle}
        isMCPPanelOpen={isMCPPanelOpen}
      />

      <main className="app-main">
        <ChatContainer
          messages={messages}
          isTyping={isTyping}
          messagesEndRef={messagesEndRef}
        />

        <MessageInput
          onSendMessage={handleSendMessage}
          isVoiceEnabled={isVoiceEnabled}
          disabled={!isConnected}
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
    </div>
  );
};

export default App;
