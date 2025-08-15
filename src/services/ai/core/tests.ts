import axios from "axios";
import { Logger } from "../../../utils/logger";
import OpenAI from "openai";
import type { GenerativeModel } from "@google/generative-ai";

export async function testOpenAI(
  logger: Logger,
  client: OpenAI | null,
  apiKey: string | null
): Promise<boolean> {
  if (!apiKey) {
    logger.error("❌ No OpenAI API key configured");
    return false;
  }
  if (!client) return false;
  logger.info("🔄 Testing OpenAI connection...");
  try {
    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Test" }],
      max_tokens: 5,
      temperature: 0,
    });
    return !!response.choices[0]?.message?.content;
  } catch (error: any) {
    throw decorateError("OpenAI", error);
  }
}

export async function testGemini(
  logger: Logger,
  model: GenerativeModel | null,
  apiKey: string | null
): Promise<boolean> {
  if (!apiKey) {
    logger.error("❌ No Gemini API key configured");
    return false;
  }
  if (!model) return false;
  logger.info("🔄 Testing Gemini connection...");
  try {
    const result = await model.generateContent("Test");
    const text = (await result.response).text();
    return !!text;
  } catch (error: any) {
    throw decorateError("Gemini", error);
  }
}

export async function testAnthropic(
  logger: Logger,
  apiKey: string | null
): Promise<boolean> {
  if (!apiKey) {
    logger.error("❌ No Anthropic API key configured");
    return false;
  }
  logger.info("🔄 Testing Anthropic connection...");
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-haiku-20240307",
        max_tokens: 5,
        messages: [{ role: "user", content: "Test" }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      }
    );
    return !!response.data?.content?.[0]?.text;
  } catch (error: any) {
    throw decorateError("Anthropic", error);
  }
}

function decorateError(provider: string, error: any): Error {
  const message =
    error?.response?.data?.error?.message || error?.message || "Unknown error";
  return new Error(`❌ ${provider} Error: ${message}`);
}
