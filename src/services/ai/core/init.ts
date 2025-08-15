import OpenAI from "openai";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { Logger } from "../../../utils/logger";
import { OpenAIProvider } from "../providers/openaiProvider";
import { GeminiProvider } from "../providers/geminiProvider";
import { AnthropicProvider } from "../providers/anthropicProvider";

export function initOpenAI(
  logger: Logger,
  apiKey: string | null
): {
  client: OpenAI | null;
  provider?: OpenAIProvider;
} {
  if (!apiKey) return { client: null };
  try {
    const client = new OpenAI({ apiKey });
    const provider = new OpenAIProvider(logger, apiKey);
    provider.init();
    logger.info("✅ OpenAI client initialized");
    return { client, provider };
  } catch (e: any) {
    logger.error(
      "❌ Failed to initialize OpenAI client:",
      new Error(e?.message || "Unknown error")
    );
    return { client: null };
  }
}

export function initGemini(
  logger: Logger,
  apiKey: string | null
): {
  client: GoogleGenerativeAI | null;
  model: GenerativeModel | null;
  provider?: GeminiProvider;
} {
  if (!apiKey) return { client: null, model: null };
  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
    const provider = new GeminiProvider(logger, apiKey);
    provider.init();
    logger.info("✅ Gemini client initialized");
    return { client, model, provider };
  } catch (e: any) {
    logger.error(
      "❌ Failed to initialize Gemini client:",
      new Error(e?.message || "Unknown error")
    );
    return { client: null, model: null };
  }
}

export function initAnthropic(
  logger: Logger,
  apiKey: string | null
): {
  provider?: AnthropicProvider;
} {
  if (!apiKey) return {};
  try {
    const provider = new AnthropicProvider(logger, apiKey);
    return { provider };
  } catch (e: any) {
    logger.error(
      "❌ Failed to initialize Anthropic provider:",
      new Error(e?.message || "Unknown error")
    );
    return {};
  }
}
