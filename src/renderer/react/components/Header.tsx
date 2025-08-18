import React from "react";
import OctaiviusIcon from "../assets/Octaivius.svg";
import GVLogo from "../assets/icons/gv2021.svg";
import SettingsIcon from "../assets/icons/settings.svg";
import ServerIcon from "../assets/icons/server.svg";
import CloseIcon from "../assets/icons/close.svg";
import DeleteIcon from "../assets/icons/delete.svg";

interface HeaderProps {
  isConnected: boolean;
  isMcpLoading?: boolean;
  onSettingsToggle: () => void;
  onClearChat: () => void;
  onMCPToggle: () => void;
  isMCPPanelOpen?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  isConnected,
  isMcpLoading,
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
            src={GVLogo}
            alt="GVLogo"
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
            className="control-btn"
            onClick={onClearChat}
            title="Clear Chat"
          >
            <img src={DeleteIcon} alt="Clear" width={20} height={20} />
          </button>

          <button
            className="control-btn"
            onClick={onSettingsToggle}
            title="Settings"
          >
            <img src={SettingsIcon} alt="Settings" width={20} height={20} />
          </button>

          <button
            className={`control-btn ${isMCPPanelOpen ? "active" : ""}`}
            onClick={onMCPToggle}
            title="MCP Servers"
          >
            <img src={ServerIcon} alt="MCP" width={20} height={20} />
          </button>

          {/* Close button for frameless window */}
          <button
            className="control-btn"
            onClick={() => window.electronAPI.windowCtrl.close()}
            title="Close"
            aria-label="Close window"
          >
            <img src={CloseIcon} alt="Close" width={20} height={20} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
