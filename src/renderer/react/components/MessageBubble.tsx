import React from "react";
import { Message } from "../types";

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={`message-bubble ${message.sender} ${
        message.isError ? "error" : ""
      }`}
    >
      <div className="message-content">
        <div className="message-text">{message.content}</div>
        <div className="message-meta">
          {message.type === "voice" && (
            <span className="voice-indicator">🎤</span>
          )}
          <span className="timestamp">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
