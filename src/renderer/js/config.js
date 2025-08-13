/**
 * Application Configuration
 * 
 * This file contains client-side configuration for the AI Chatbot application.
 * It defines constants, API endpoints, and settings that are used throughout
 * the frontend application.
 */

window.AppConfig = {
  // API Configuration
  api: {
    baseUrl: window.location.origin,
    endpoints: {
      chat: '/api/chat',
      audio: '/api/audio',
      functions: '/api/functions',
      mcp: '/api/mcp',
      health: '/api/health',
      status: '/api/status'
    },
    timeout: 30000 // 30 seconds
  },

  // WebSocket Configuration
  socket: {
    url: window.location.origin,
    options: {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectionAttempts: 5
    }
  },

  // Voice Configuration
  voice: {
    // Speech Recognition
    recognition: {
      lang: 'en-US',
      continuous: true,
      interimResults: true,
      maxAlternatives: 1
    },
    
    // Speech Synthesis
    synthesis: {
      lang: 'en-US',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0
    },
    
    // Audio Recording
    recording: {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000,
      sampleRate: 16000,
      channels: 1
    },
    
    // Supported audio formats for upload
    supportedFormats: ['audio/wav', 'audio/mp3', 'audio/ogg', 'audio/webm'],
    maxFileSize: 10 * 1024 * 1024 // 10MB
  },

  // UI Configuration
  ui: {
    // Theme settings
    theme: {
      default: 'auto', // 'light', 'dark', or 'auto'
      storageKey: 'ai-chatbot-theme'
    },
    
    // Animation settings
    animations: {
      messageDelay: 300,
      typingIndicatorDelay: 500,
      toastDuration: 5000
    },
    
    // Chat settings
    chat: {
      maxMessageLength: 4000,
      autoScroll: true,
      showTypingIndicator: true,
      messageHistory: 100 // Maximum messages to keep in memory
    },
    
    // Toast notification settings
    toast: {
      position: 'top-right',
      duration: 5000,
      maxToasts: 5
    }
  },

  // Feature Flags
  features: {
    voiceInput: true,
    fileUpload: true,
    functionCalling: true,
    mcpIntegration: true,
    darkMode: true,
    debugMode: false
  },

  // Settings that can be changed by user
  userSettings: {
    // Voice settings
    autoPlayVoice: true,
    speechRate: 1.0,
    speechPitch: 1.0,
    speechVolume: 1.0,
    voiceLanguage: 'en-US',
    
    // Interface settings
    theme: 'auto',
    showTimestamps: false,
    compactMode: false,
    
    // Advanced settings
    debugMode: false,
    autoScroll: true,
    soundEnabled: true
  },

  // Error Messages
  errors: {
    network: 'Network connection failed. Please check your internet connection.',
    server: 'Server error occurred. Please try again later.',
    microphone: 'Microphone access denied. Please enable microphone permissions.',
    audio: 'Audio processing failed. Please try again.',
    fileSize: 'File size too large. Maximum size is 10MB.',
    fileType: 'Unsupported file type. Please upload WAV, MP3, OGG, or WebM files.',
    timeout: 'Request timed out. Please try again.',
    unknown: 'An unexpected error occurred. Please try again.'
  },

  // Success Messages
  messages: {
    connected: 'Connected to server',
    disconnected: 'Disconnected from server',
    reconnecting: 'Reconnecting...',
    voiceEnabled: 'Voice input enabled',
    voiceDisabled: 'Voice input disabled',
    settingsSaved: 'Settings saved successfully',
    fileSent: 'Audio file sent successfully'
  },

  // Debug Configuration
  debug: {
    enabled: false,
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    showNetworkRequests: false,
    showSocketEvents: false,
    showVoiceEvents: false
  },

  // Performance Configuration
  performance: {
    messageRenderBatchSize: 10,
    scrollDebounceMs: 100,
    typingDebounceMs: 300,
    resizeDebounceMs: 250
  }
};

// Utility function to get configuration values
window.getConfig = function(path, defaultValue = null) {
  const keys = path.split('.');
  let current = window.AppConfig;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return defaultValue;
    }
  }
  
  return current;
};

// Utility function to set configuration values
window.setConfig = function(path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  let current = window.AppConfig;
  
  for (const key of keys) {
    if (current && typeof current === 'object') {
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    } else {
      console.error('Cannot set config at path:', path);
      return false;
    }
  }
  
  if (current && typeof current === 'object' && lastKey) {
    current[lastKey] = value;
    return true;
  }
  
  return false;
};

// Initialize user settings from localStorage
function loadUserSettings() {
  try {
    const saved = localStorage.getItem('ai-chatbot-settings');
    if (saved) {
      const settings = JSON.parse(saved);
      Object.assign(window.AppConfig.userSettings, settings);
    }
  } catch (error) {
    console.warn('Failed to load user settings:', error);
  }
}

// Save user settings to localStorage
window.saveUserSettings = function() {
  try {
    localStorage.setItem('ai-chatbot-settings', JSON.stringify(window.AppConfig.userSettings));
    return true;
  } catch (error) {
    console.error('Failed to save user settings:', error);
    return false;
  }
};

// Initialize theme based on user preference or system preference
function initializeTheme() {
  const savedTheme = window.AppConfig.userSettings.theme;
  let theme = savedTheme;
  
  if (theme === 'auto') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  document.documentElement.setAttribute('data-theme', theme);
  
  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (window.AppConfig.userSettings.theme === 'auto') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}

// Initialize configuration on page load
document.addEventListener('DOMContentLoaded', function() {
  loadUserSettings();
  initializeTheme();
  
  // Enable debug mode if specified in URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('debug') === 'true') {
    window.AppConfig.debug.enabled = true;
    window.AppConfig.userSettings.debugMode = true;
  }
  
  // Log configuration in debug mode
  if (window.AppConfig.debug.enabled) {
    console.log('AI Chatbot Configuration:', window.AppConfig);
  }
});

// Export for module systems (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.AppConfig;
}
