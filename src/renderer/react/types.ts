export interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  timestamp: Date;
  type: "text" | "voice";
  isError?: boolean;
}

export interface AppSettings {
  aiProvider: "openai" | "gemini" | "anthropic";
  voiceEnabled: boolean;
  debugMode: boolean;
  theme: "light" | "dark";
}

export interface VoiceSettings {
  enabled: boolean;
  autoSpeak: boolean;
  language: string;
}

export interface ConnectionStatus {
  isConnected: boolean;
  lastPing?: Date;
  errorMessage?: string;
}
