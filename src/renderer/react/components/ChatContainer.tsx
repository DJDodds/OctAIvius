import React from "react";
import { Message } from "../types";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

interface ChatContainerProps {
  messages: Message[];
  isTyping: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  isTyping,
  messagesEndRef,
}) => {
  return (
    <div className="chat-container">
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-chat-content">
              <span className="icon">💬</span>
              <h3>Start a conversation</h3>
              <p>Type a message or use voice input to begin chatting</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isTyping && <TypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatContainer;
