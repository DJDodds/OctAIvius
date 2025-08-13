import React from "react";

interface HeaderProps {
  isConnected: boolean;
  isVoiceEnabled: boolean;
  onVoiceToggle: () => void;
  onSettingsToggle: () => void;
  onClearChat: () => void;
  onMCPToggle: () => void;
  isMCPPanelOpen?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  isConnected,
  isVoiceEnabled,
  onVoiceToggle,
  onSettingsToggle,
  onClearChat,
  onMCPToggle,
  isMCPPanelOpen,
}) => {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="app-title">
            <span className="icon">🤖</span>
            OctAIvius
          </h1>
          <div
            className={`connection-status ${
              isConnected ? "connected" : "disconnected"
            }`}
          >
            <span className="status-dot"></span>
            {isConnected ? "Connected" : "Disconnected"}
          </div>
        </div>

        <div className="header-controls">
          <button
            className={`control-btn voice-btn ${
              isVoiceEnabled ? "active" : ""
            }`}
            onClick={onVoiceToggle}
            title="Toggle Voice Input"
          >
            <span className="icon">{isVoiceEnabled ? "🎤" : "🔇"}</span>
          </button>

          <button
            className="control-btn"
            onClick={onClearChat}
            title="Clear Chat"
          >
            <span className="icon">🗑️</span>
          </button>

          <button
            className="control-btn"
            onClick={onSettingsToggle}
            title="Settings"
          >
            <span className="icon">⚙️</span>
          </button>

          <button
            className={`control-btn ${isMCPPanelOpen ? "active" : ""}`}
            onClick={onMCPToggle}
            title="MCP Servers"
          >
            <span className="icon">🧩</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
