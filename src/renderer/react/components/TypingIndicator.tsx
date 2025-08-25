import React from "react";

const stepLabels: Record<string, string> = {
  "mcp-connect": "Connecting to MCP…",
  "refresh-schemas": "Refreshing schemas…",
  "suggest-payload": "Suggesting payload…",
  invoke: "Invoking command…",
  guidance: "Preparing guidance…",
  "ai-process": "Generating response…",
};

const TypingIndicator: React.FC<{
  step?: string | undefined;
  state?: string | undefined;
}> = ({ step, state }) => {
  const label = step ? stepLabels[step] || "Working…" : "AI is typing…";
  return (
    <div className="message-bubble assistant typing">
      <div className="message-content">
        <div className="typing-indicator">
          <div className="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span className="typing-text">{label}</span>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
