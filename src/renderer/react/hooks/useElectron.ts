import { useState, useEffect } from "react";

export const useElectron = () => {
  const [isElectronAvailable, setIsElectronAvailable] = useState(false);

  useEffect(() => {
    // Check if we're running in Electron
    setIsElectronAvailable(typeof window.electronAPI !== "undefined");
  }, []);

  const sendMessage = async (message: string): Promise<string> => {
    if (isElectronAvailable && window.electronAPI) {
      try {
        const result = await window.electronAPI.chat.sendMessage(message);
        if (result.success && result.response) {
          return result.response;
        } else {
          throw new Error(result.error || "Failed to get response");
        }
      } catch (error) {
        console.error("Failed to send message via Electron IPC:", error);
        throw error;
      }
    } else {
      // Fallback for development or web version
      throw new Error("Electron API not available");
    }
  };

  const startVoiceRecording = async (): Promise<void> => {
    if (isElectronAvailable && window.electronAPI) {
      try {
        await window.electronAPI.voice.startRecording();
      } catch (error) {
        console.error("Failed to start voice recording:", error);
        throw error;
      }
    } else {
      throw new Error("Electron API not available");
    }
  };

  const stopVoiceRecording = async (): Promise<string> => {
    if (isElectronAvailable && window.electronAPI) {
      try {
        const result = await window.electronAPI.voice.stopRecording();
        return result.text || result.transcription || "";
      } catch (error) {
        console.error("Failed to stop voice recording:", error);
        throw error;
      }
    } else {
      throw new Error("Electron API not available");
    }
  };

  const saveSettings = async (settings: any): Promise<void> => {
    if (isElectronAvailable && window.electronAPI) {
      try {
        // Use AI key update for now, or implement a settings API later
        if (settings.aiKeys) {
          await window.electronAPI.ai.updateKeys(settings.aiKeys);
        }
      } catch (error) {
        console.error("Failed to save settings:", error);
        throw error;
      }
    }
  };

  const loadSettings = async (): Promise<any> => {
    if (isElectronAvailable && window.electronAPI) {
      try {
        const result = await window.electronAPI.app.getConfig();
        return result.success ? result.config : null;
      } catch (error) {
        console.error("Failed to load settings:", error);
        return null;
      }
    }
    return null;
  };

  const clearConversation = async (): Promise<void> => {
    if (isElectronAvailable && window.electronAPI) {
      try {
        await window.electronAPI.conversation.clear();
      } catch (error) {
        console.error("Failed to clear conversation:", error);
        throw error;
      }
    }
  };

  const getConversationHistory = async (): Promise<any[]> => {
    if (isElectronAvailable && window.electronAPI) {
      try {
        const result = await window.electronAPI.conversation.getHistory();
        return result.success ? result.history || [] : [];
      } catch (error) {
        console.error("Failed to get conversation history:", error);
        return [];
      }
    }
    return [];
  };

  return {
    isElectronAvailable,
    sendMessage,
    startVoiceRecording,
    stopVoiceRecording,
    saveSettings,
    loadSettings,
    clearConversation,
    getConversationHistory,
  };
};
