import { ChatMessage } from "../../../types";
import { Logger } from "../../../utils/logger";

export class ConversationManager {
  private history: ChatMessage[] = [];
  constructor(private logger: Logger, private maxLen: number = 20) {}

  add(role: "user" | "assistant" | "system", content: string) {
    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: "main_session",
      content,
      role,
      timestamp: new Date(),
    };
    this.history.push(message);
    if (this.history.length > this.maxLen) {
      this.history = this.history.slice(-this.maxLen);
    }
    this.logger.info(
      `💬 Added ${role} message to conversation history (${this.history.length} messages total)`
    );
  }

  clear() {
    this.history = [];
    this.logger.info("🗑️ Conversation history cleared");
  }

  list(): ChatMessage[] {
    return [...this.history];
  }

  context(): Array<{ role: "user" | "assistant"; content: string }> {
    return this.history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }
}
