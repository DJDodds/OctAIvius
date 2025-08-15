export function getMockResponse(message: string): string {
  const responses = [
    "🔑 Please configure your API keys to start chatting! Click the settings button (⚙️) in the top-right corner and add your Google Gemini, OpenAI, or Anthropic API key.",
    "👋 Hello! I'm GVAIBot running in demo mode. To unlock real AI conversations, please add your API keys in the Settings panel.",
    "🚀 Ready to chat with real AI? Configure your Google Gemini (FREE), OpenAI (GPT), or Anthropic (Claude) API key in Settings to get started!",
    `💬 You said: "${message}"\n\n🔧 This is a demo response. Add your API keys in Settings to enable real AI conversations with Gemini, GPT, or Claude.`,
  ];
  const i = Math.floor(Math.random() * responses.length);
  const response = responses[i];
  if (!response) throw new Error("No mock response available");
  return response;
}
