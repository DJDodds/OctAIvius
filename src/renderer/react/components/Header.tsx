import React from "react";
import OctaiviusIcon from "../assets/Octaivius.svg";

interface HeaderProps {
  isConnected: boolean;
  isVoiceEnabled: boolean;
  isMcpLoading?: boolean;
  onVoiceToggle: () => void;
  onSettingsToggle: () => void;
  onClearChat: () => void;
  onMCPToggle: () => void;
  isMCPPanelOpen?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  isConnected,
  isVoiceEnabled,
  isMcpLoading,
  onVoiceToggle,
  onSettingsToggle,
  onClearChat,
  onMCPToggle,
  isMCPPanelOpen,
}) => {
  return (
    <header className="app-header draggable">
      <div className="header-content">
        <div className="header-left">
          <img
            src={OctaiviusIcon}
            alt="OctAIvius"
            width={75}
            height={75}
            style={{ display: "block" }}
          />
          <div
            className={`connection-status ${
              isConnected ? "connected" : "disconnected"
            }`}
          >
            <span className="status-dot"></span>
            {isConnected ? "Connected" : "Disconnected"}
          </div>
          {typeof isMcpLoading === "boolean" && (
            <div
              className={`connection-status no-drag ${
                isMcpLoading ? "connecting" : "connected"
              }`}
              style={{ marginLeft: 8, cursor: "pointer" }}
              title={
                isMcpLoading
                  ? "Bootstrapping schemas and loading tools"
                  : "Open MCP panel"
              }
              role="button"
              aria-label={
                isMcpLoading ? "MCP loading status" : "Open MCP panel"
              }
              tabIndex={0}
              onClick={onMCPToggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onMCPToggle();
                }
              }}
            >
              <span className="status-dot"></span>
              {isMcpLoading ? "MCP loading…" : "MCP ready"}
            </div>
          )}
        </div>

        <div className="header-controls no-drag">
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

          {/* Close button for frameless window */}
          <button
            className="control-btn"
            onClick={() => window.electronAPI.windowCtrl.close()}
            title="Close"
            aria-label="Close window"
          >
            <span className="icon">✖️</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
