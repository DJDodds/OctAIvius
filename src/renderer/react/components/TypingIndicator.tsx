import React from "react";

const TypingIndicator: React.FC = () => {
  return (
    <div className="message-bubble assistant typing">
      <div className="message-content">
        <div className="typing-indicator">
          <div className="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span className="typing-text">AI is typing...</span>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
