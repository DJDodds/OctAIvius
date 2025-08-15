/**
 * Simplified Preload script for Electron
 * Provides secure IPC bridge between main and renderer processes
 */

import { contextBridge, ipcRenderer } from "electron";

/**
 * Expose safe APIs to the renderer process
 */
contextBridge.exposeInMainWorld("electronAPI", {
  // Chat operations
  chat: {
    sendMessage: (message: string) =>
      ipcRenderer.invoke("chat:send-message", message),
    onNewChat: (callback: () => void) => {
      const cleanup = () => ipcRenderer.removeAllListeners("chat:new");
      ipcRenderer.on("chat:new", callback);
      return cleanup;
    },
  },

  // AI configuration
  ai: {
    updateKeys: (keys: {
      openaiKey?: string;
      anthropicKey?: string;
      geminiKey?: string;
    }) => ipcRenderer.invoke("ai:update-keys", keys),
    testConnection: (provider: "openai" | "anthropic" | "gemini") =>
      ipcRenderer.invoke("ai:test-connection", provider),
  },

  // Conversation management
  conversation: {
    getHistory: () => ipcRenderer.invoke("conversation:get-history"),
    clear: () => ipcRenderer.invoke("conversation:clear"),
  },

  // Network connectivity
  network: {
    checkConnectivity: () => ipcRenderer.invoke("network:check-connectivity"),
  },

  // App configuration
  app: {
    getConfig: () => ipcRenderer.invoke("app:get-config"),
  },

  // Window controls
  windowCtrl: {
    close: () => ipcRenderer.invoke("window:close"),
  },

  // Voice operations
  voice: {
    processAudio: (audioData: ArrayBuffer) =>
      ipcRenderer.invoke("voice:process-audio", audioData),
    startRecording: () => ipcRenderer.invoke("voice:start-recording"),
    stopRecording: () => ipcRenderer.invoke("voice:stop-recording"),
  },

  // MCP operations
  mcp: {
    listServers: () => ipcRenderer.invoke("mcp:list-servers"),
    connectServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:connect-server", serverId),
    callFunction: (serverId: string, functionName: string, args: any) =>
      ipcRenderer.invoke("mcp:call-function", serverId, functionName, args),
    disconnectServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:disconnect-server", serverId),
    registerProcessServer: (cfg: any) =>
      ipcRenderer.invoke("mcp:register-process-server", cfg),
    listTools: (serverId: string) =>
      ipcRenderer.invoke("mcp:list-tools", serverId),
    bootstrapSchemas: (serverId: string) =>
      ipcRenderer.invoke("mcp:bootstrap-schemas", serverId),
    onServersUpdated: (
      handler: (evt: { serverId: string; status: string }) => void
    ) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { serverId: string; status: string }
      ) => handler(payload);
      ipcRenderer.on("mcp:servers-updated", listener);
      return () => ipcRenderer.removeListener("mcp:servers-updated", listener);
    },
  },

  // Platform information
  platform: {
    isMac: process.platform === "darwin",
    isWindows: process.platform === "win32",
    isLinux: process.platform === "linux",
  },
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      chat: {
        sendMessage: (
          message: string
        ) => Promise<{ success: boolean; response?: string; error?: string }>;
        onNewChat: (callback: () => void) => () => void;
      };
      ai: {
        updateKeys: (keys: {
          openaiKey?: string;
          anthropicKey?: string;
          geminiKey?: string;
        }) => Promise<{ success: boolean; error?: string }>;
        testConnection: (
          provider: "openai" | "anthropic" | "gemini"
        ) => Promise<{
          success: boolean;
          connected: boolean;
          error?: string;
        }>;
      };
      conversation: {
        getHistory: () => Promise<{
          success: boolean;
          history?: any[];
          error?: string;
        }>;
        clear: () => Promise<{ success: boolean; error?: string }>;
      };
      network: {
        checkConnectivity: () => Promise<{
          success: boolean;
          connected: boolean;
          error?: string;
        }>;
      };
      voice: {
        processAudio: (audioData: ArrayBuffer) => Promise<any>;
        startRecording: () => Promise<any>;
        stopRecording: () => Promise<any>;
      };
      mcp: {
        listServers: () => Promise<any>;
        connectServer: (serverId: string) => Promise<any>;
        callFunction: (
          serverId: string,
          functionName: string,
          args: any
        ) => Promise<any>;
        disconnectServer: (serverId: string) => Promise<any>;
        registerProcessServer: (cfg: any) => Promise<any>;
        listTools: (serverId: string) => Promise<any>;
        bootstrapSchemas: (serverId: string) => Promise<any>;
        onServersUpdated: (
          handler: (evt: { serverId: string; status: string }) => void
        ) => () => void;
      };
      app: {
        getConfig: () => Promise<{
          success: boolean;
          config?: any;
          error?: string;
        }>;
      };
      windowCtrl: {
        close: () => Promise<{ success: boolean; error?: string }>;
      };
      platform: {
        isMac: boolean;
        isWindows: boolean;
        isLinux: boolean;
      };
    };
  }
}
