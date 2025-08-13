/**
 * Application Configuration (TypeScript)
 * Mirrors the legacy config.js but adds types and safer accessors.
 */

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// Shape of the AppConfig (kept permissive to avoid churn)
interface AppConfigShape {
  api: {
    baseUrl: string;
    endpoints: Record<string, string>;
    timeout: number;
  };
  socket: {
    url: string;
    options: Record<string, any>;
  };
  voice: {
    recognition: Record<string, any>;
    synthesis: Record<string, any>;
    recording: Record<string, any>;
    supportedFormats: string[];
    maxFileSize: number;
  };
  ui: {
    theme: { default: string; storageKey: string };
    animations: Record<string, number>;
    chat: Record<string, any>;
    toast: { position: string; duration: number; maxToasts: number };
  };
  features: Record<string, boolean>;
  userSettings: Record<string, any>;
  errors: Record<string, string>;
  messages: Record<string, string>;
  debug: { enabled: boolean; logLevel: string; [k: string]: any };
  performance: Record<string, number>;
}

const defaultConfig: AppConfigShape = {
  api: {
    baseUrl: window.location.origin,
    endpoints: {
      chat: "/api/chat",
      audio: "/api/audio",
      functions: "/api/functions",
      mcp: "/api/mcp",
      health: "/api/health",
      status: "/api/status",
    },
    timeout: 30000,
  },
  socket: {
    url: window.location.origin,
    options: {
      transports: ["websocket", "polling"],
      timeout: 20000,
      forceNew: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectionAttempts: 5,
    },
  },
  voice: {
    recognition: {
      lang: "en-US",
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
    },
    synthesis: {
      lang: "en-US",
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
    },
    recording: {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 128000,
      sampleRate: 16000,
      channels: 1,
    },
    supportedFormats: ["audio/wav", "audio/mp3", "audio/ogg", "audio/webm"],
    maxFileSize: 10 * 1024 * 1024,
  },
  ui: {
    theme: { default: "auto", storageKey: "ai-chatbot-theme" },
    animations: {
      messageDelay: 300,
      typingIndicatorDelay: 500,
      toastDuration: 5000,
    },
    chat: {
      maxMessageLength: 4000,
      autoScroll: true,
      showTypingIndicator: true,
      messageHistory: 100,
    },
    toast: { position: "top-right", duration: 5000, maxToasts: 5 },
  },
  features: {
    voiceInput: true,
    fileUpload: true,
    functionCalling: true,
    mcpIntegration: true,
    darkMode: true,
    debugMode: false,
  },
  userSettings: {
    autoPlayVoice: true,
    speechRate: 1.0,
    speechPitch: 1.0,
    speechVolume: 1.0,
    voiceLanguage: "en-US",
    theme: "auto",
    showTimestamps: false,
    compactMode: false,
    debugMode: false,
    autoScroll: true,
    soundEnabled: true,
  },
  errors: {
    network: "Network connection failed. Please check your internet connection.",
    server: "Server error occurred. Please try again later.",
    microphone: "Microphone access denied. Please enable microphone permissions.",
    audio: "Audio processing failed. Please try again.",
    fileSize: "File size too large. Maximum size is 10MB.",
    fileType: "Unsupported file type. Please upload WAV, MP3, OGG, or WebM files.",
    timeout: "Request timed out. Please try again.",
    unknown: "An unexpected error occurred. Please try again.",
  },
  messages: {
    connected: "Connected to server",
    disconnected: "Disconnected from server",
    reconnecting: "Reconnecting...",
    voiceEnabled: "Voice input enabled",
    voiceDisabled: "Voice input disabled",
    settingsSaved: "Settings saved successfully",
    fileSent: "Audio file sent successfully",
  },
  debug: {
    enabled: false,
    logLevel: "info",
    showNetworkRequests: false,
    showSocketEvents: false,
    showVoiceEvents: false,
  },
  performance: {
    messageRenderBatchSize: 10,
    scrollDebounceMs: 100,
    typingDebounceMs: 300,
    resizeDebounceMs: 250,
  },
};

// Initialize global AppConfig if not present
if (!(window as any).AppConfig) {
  (window as any).AppConfig = defaultConfig;
}

// getConfig helper
;(window as any).getConfig = function getConfig(path: string, defaultValue: any = null) {
  const keys = String(path || "").split(".");
  let current: any = (window as any).AppConfig;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return defaultValue;
    }
  }
  return current;
};

// setConfig helper
;(window as any).setConfig = function setConfig(path: string, value: any): boolean {
  const keys = String(path || "").split(".");
  const lastKey = keys.pop();
  let current: any = (window as any).AppConfig;
  for (const key of keys) {
    if (current && typeof current === "object") {
      if (!(key in current)) current[key] = {};
      current = current[key];
    } else {
      console.error("Cannot set config at path:", path);
      return false;
    }
  }
  if (current && typeof current === "object" && lastKey) {
    current[lastKey] = value;
    return true;
  }
  return false;
};

// Save user settings
;(window as any).saveUserSettings = function saveUserSettings(): boolean {
  try {
    localStorage.setItem(
      "ai-chatbot-settings",
      JSON.stringify((window as any).AppConfig.userSettings)
    );
    return true;
  } catch (error) {
    console.error("Failed to save user settings:", error);
    return false;
  }
};

// Load user settings
function loadUserSettings() {
  try {
    const saved = localStorage.getItem("ai-chatbot-settings");
    if (saved) {
      const settings = JSON.parse(saved);
      Object.assign((window as any).AppConfig.userSettings, settings);
    }
  } catch (error) {
    console.warn("Failed to load user settings:", error);
  }
}

// Initialize theme from settings or system
function initializeTheme() {
  const savedTheme = (window as any).AppConfig.userSettings?.theme ?? "auto";
  let theme = savedTheme;
  if (theme === "auto") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
  // React to system changes
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if ((window as any).AppConfig.userSettings?.theme === "auto") {
        document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
      }
    });
}

// Bootstrap on DOM ready
window.addEventListener("DOMContentLoaded", () => {
  loadUserSettings();
  initializeTheme();
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("debug") === "true") {
    (window as any).AppConfig.debug.enabled = true;
    (window as any).AppConfig.userSettings.debugMode = true;
  }
  if ((window as any).AppConfig?.debug?.enabled) {
    console.log("AI Chatbot Configuration (TS):", (window as any).AppConfig);
  }
});

// Optional CJS export when loaded under module systems
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (typeof module !== "undefined" && (module as any).exports) {
    ;(module as any).exports = (window as any).AppConfig;
  }
} catch {}

export default (window as any).AppConfig as AppConfigShape;
