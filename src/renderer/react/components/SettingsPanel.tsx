import React from "react";
import { AppSettings } from "../types";

interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsChange,
  onClose,
}) => {
  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h3>Settings</h3>
          <button onClick={onClose} className="close-btn">
            <span className="icon">✕</span>
          </button>
        </div>

        <div className="settings-content">
          <div className="setting-group">
            <h4>AI Provider</h4>
            <select
              value={settings.aiProvider}
              onChange={(e) =>
                onSettingsChange({ aiProvider: e.target.value as any })
              }
              className="setting-select"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic Claude</option>
            </select>
          </div>

          <div className="setting-group">
            <h4>Voice Settings</h4>
            <label className="setting-checkbox">
              <input
                type="checkbox"
                checked={settings.voiceEnabled}
                onChange={(e) =>
                  onSettingsChange({ voiceEnabled: e.target.checked })
                }
              />
              <span>Enable Voice Input</span>
            </label>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.85 }}>
                Mic Boost: {Math.round((settings.micBoost ?? 2) * 100)}%
              </label>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.1}
                value={settings.micBoost ?? 2}
                onChange={(e) =>
                  onSettingsChange({ micBoost: Number(e.target.value) })
                }
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.85 }}>
                VAD Sensitivity
              </label>
              <select
                value={settings.vadSensitivity ?? "medium"}
                onChange={(e) =>
                  onSettingsChange({ vadSensitivity: e.target.value as any })
                }
                className="setting-select"
              >
                <option value="low">Low (noisy room)</option>
                <option value="medium">Medium</option>
                <option value="high">High (quiet room)</option>
              </select>
            </div>
          </div>

          <div className="setting-group">
            <h4>Appearance</h4>
            <select
              value={settings.theme}
              onChange={(e) =>
                onSettingsChange({ theme: e.target.value as any })
              }
              className="setting-select"
            >
              <option value="dark">Dark Theme</option>
              <option value="light">Light Theme</option>
            </select>
          </div>

          <div className="setting-group">
            <h4>Advanced</h4>
            <label className="setting-checkbox">
              <input
                type="checkbox"
                checked={settings.debugMode}
                onChange={(e) =>
                  onSettingsChange({ debugMode: e.target.checked })
                }
              />
              <span>Debug Mode</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
