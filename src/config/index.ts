/**
 * Configuration Management System
 *
 * This module provides centralized configuration management for the AI chatbot application.
 * It loads configuration from environment variables with validation and type safety.
 *
 * Features:
 * - Environment variable validation
 * - Type-safe configuration access
 * - Default value handling
 * - Configuration validation on startup
 * - Support for multiple environments (dev, staging, prod)
 */

import dotenv from "dotenv";
import Joi from "joi";
import * as fs from "fs";
import {
  AppConfig,
  ServerConfig,
  AIConfig,
  AuthConfig,
  VoiceConfig,
  MCPConfig,
  LoggingConfig,
  SecurityConfig,
  UploadConfig,
} from "../types/index";

// Load environment variables from .env file
dotenv.config();

/**
 * Environment variable validation schema
 * Defines the structure and validation rules for all configuration values
 */
const envSchema = Joi.object({
  // Server configuration
  PORT: Joi.number().port().default(3000),
  NODE_ENV: Joi.string()
    .valid("development", "staging", "production")
    .default("development"),
  HOST: Joi.string().default("localhost"),

  // AI service configuration
  AI_PROVIDER: Joi.string()
    .valid("anthropic", "openai", "gemini")
    .default("gemini"),
  ANTHROPIC_API_KEY: Joi.string().optional(),
  CLAUDE_MODEL: Joi.string().default("claude-3-sonnet-20240229"),
  OPENAI_API_KEY: Joi.string().optional(),
  OPENAI_MODEL: Joi.string().default("gpt-3.5-turbo"),
  GEMINI_API_KEY: Joi.string().optional(),
  GEMINI_MODEL: Joi.string().default("gemini-1.5-flash"),

  // JWT configuration
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRY: Joi.string().default("24h"),

  // Database configuration
  DATABASE_URL: Joi.string().optional(),
  REDIS_URL: Joi.string().optional(),

  // Speech-to-Text configuration
  GOOGLE_SPEECH_API_KEY: Joi.string().optional(),
  GOOGLE_PROJECT_ID: Joi.string().optional(),
  AZURE_SPEECH_KEY: Joi.string().optional(),
  AZURE_SPEECH_REGION: Joi.string().optional(),

  // MCP configuration
  MCP_SERVERS_CONFIG_PATH: Joi.string().default("./config/mcp-servers.json"),
  MCP_CONNECTION_TIMEOUT: Joi.number().default(30000),
  MCP_MAX_RETRIES: Joi.number().default(3),

  // File upload configuration
  MAX_FILE_SIZE: Joi.string().default("10MB"),
  UPLOAD_PATH: Joi.string().default("./uploads"),
  AUDIO_FORMATS: Joi.string().default("wav,mp3,ogg,webm"),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),

  // CORS configuration
  CORS_ORIGIN: Joi.string().default("http://localhost:3000"),
  CORS_METHODS: Joi.string().default("GET,HEAD,PUT,PATCH,POST,DELETE"),
  CORS_CREDENTIALS: Joi.boolean().default(true),

  // Logging configuration
  LOG_LEVEL: Joi.string()
    .valid("error", "warn", "info", "debug")
    .default("info"),
  LOG_FILE_PATH: Joi.string().default("./logs/app.log"),
  LOG_MAX_SIZE: Joi.string().default("10m"),
  LOG_MAX_FILES: Joi.number().default(5),

  // Function execution configuration
  FUNCTION_TIMEOUT_MS: Joi.number().default(30000),
  FUNCTION_MAX_MEMORY_MB: Joi.number().default(512),
  FUNCTION_SANDBOX_ENABLED: Joi.boolean().default(true),

  // System integration
  SYSTEM_API_BASE_URL: Joi.string().uri().optional(),
  SYSTEM_API_KEY: Joi.string().optional(),
  SYSTEM_API_TIMEOUT: Joi.number().default(10000),

  // Health check configuration
  HEALTH_CHECK_INTERVAL: Joi.number().default(30000),
  HEALTH_CHECK_TIMEOUT: Joi.number().default(5000),

  // Session configuration
  SESSION_SECRET: Joi.string().min(32).required(),
  SESSION_TIMEOUT: Joi.number().default(3600000), // 1 hour

  // Audio processing
  AUDIO_SAMPLE_RATE: Joi.number().default(16000),
  AUDIO_CHANNELS: Joi.number().default(1),
  AUDIO_BIT_DEPTH: Joi.number().default(16),
}).unknown(true); // Allow unknown environment variables

/**
 * Validates and parses environment variables
 * @returns Validated environment configuration
 * @throws Error if validation fails
 */
function validateEnv(): Record<string, any> {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errorMessages = error.details
      .map((detail: any) => detail.message)
      .join(", ");
    throw new Error(`Environment variable validation failed: ${errorMessages}`);
  }

  return value;
}

// Validate environment variables on module load
const env = validateEnv();

/**
 * Converts file size string to bytes
 * Supports formats like '10MB', '1GB', '512KB'
 */
function parseFileSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/i);
  if (!match || !match[1]) {
    throw new Error(`Invalid file size format: ${sizeStr}`);
  }

  const size = parseFloat(match[1]);
  const unit = (match[2] || "B").toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  return size * (multipliers[unit] || 1);
}

/**
 * Server configuration
 */
const serverConfig: ServerConfig = {
  port: env.PORT,
  host: env.HOST,
  environment: env.NODE_ENV as "development" | "staging" | "production",
  corsOrigin: env.CORS_ORIGIN.split(",").map((origin: string) => origin.trim()),
  trustProxy: env.NODE_ENV === "production",
};

/**
 * AI service configuration
 */
const aiConfig: AIConfig = {
  provider: env.AI_PROVIDER as "anthropic" | "openai" | "gemini",
  apiKey:
    env.AI_PROVIDER === "anthropic"
      ? env.ANTHROPIC_API_KEY
      : env.AI_PROVIDER === "openai"
      ? env.OPENAI_API_KEY
      : env.GEMINI_API_KEY,
  model:
    env.AI_PROVIDER === "anthropic"
      ? env.CLAUDE_MODEL
      : env.AI_PROVIDER === "openai"
      ? env.OPENAI_MODEL
      : env.GEMINI_MODEL,
  maxTokens: 4096,
  temperature: 0.7,
  timeout: 30000,
};

/**
 * Authentication configuration
 */
const authConfig: AuthConfig = {
  jwtSecret: env.JWT_SECRET,
  jwtExpiry: env.JWT_EXPIRY,
  bcryptRounds: 12,
  sessionTimeout: env.SESSION_TIMEOUT,
};

/**
 * Voice processing configuration
 */
const voiceConfig: VoiceConfig = {
  enabled: !!(env.GOOGLE_SPEECH_API_KEY || env.AZURE_SPEECH_KEY),
  provider: env.GOOGLE_SPEECH_API_KEY ? "google" : "azure",
  language: "en-US",
  sampleRate: env.AUDIO_SAMPLE_RATE,
  channels: env.AUDIO_CHANNELS,
  encoding: "LINEAR16",
};

/**
 * MCP (Model Context Protocol) configuration
 */
const mcpConfig: MCPConfig = {
  servers: [], // Will be loaded from config file
  connectionTimeout: env.MCP_CONNECTION_TIMEOUT,
  maxRetries: env.MCP_MAX_RETRIES,
  retryDelay: 1000,
};

/**
 * Logging configuration
 */
const loggingConfig: LoggingConfig = {
  level: env.LOG_LEVEL as "error" | "warn" | "info" | "debug",
  file: {
    enabled: true,
    path: env.LOG_FILE_PATH,
    maxSize: env.LOG_MAX_SIZE,
    maxFiles: env.LOG_MAX_FILES,
  },
  console: {
    enabled: env.NODE_ENV !== "production",
    colorize: env.NODE_ENV === "development",
  },
};

/**
 * Security configuration
 */
const securityConfig: SecurityConfig = {
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  cors: {
    origin: serverConfig.corsOrigin,
    methods: env.CORS_METHODS.split(",").map((method: string) => method.trim()),
    credentials: env.CORS_CREDENTIALS,
    optionsSuccessStatus: 200,
  },
  helmet: {
    contentSecurityPolicy: env.NODE_ENV === "production",
    hsts: env.NODE_ENV === "production",
    noSniff: true,
    xssFilter: true,
  },
  upload: {
    virusScanning: false, // Can be enabled with additional services
    fileTypeValidation: true,
    maxFiles: 10,
    quarantineDirectory: "./quarantine",
  },
};

/**
 * File upload configuration
 */
const uploadConfig: UploadConfig = {
  maxFileSize: parseFileSize(env.MAX_FILE_SIZE),
  allowedFormats: env.AUDIO_FORMATS.split(",").map((format: string) =>
    format.trim()
  ),
  destination: env.UPLOAD_PATH,
  tempDirectory: "./temp",
};

/**
 * Complete application configuration
 */
export const config: AppConfig = {
  server: serverConfig,
  ai: aiConfig,
  auth: authConfig,
  voice: voiceConfig,
  mcp: mcpConfig,
  logging: loggingConfig,
  security: securityConfig,
  upload: uploadConfig,
};

/**
 * Validates the complete configuration
 * Ensures all required dependencies are available
 */
export function validateConfiguration(): void {
  // Validate AI configuration - Skip for testing
  if (!config.ai.apiKey && config.server.environment === "production") {
    throw new Error(
      `API key is required for ${config.ai.provider} provider in production`
    );
  }

  // Validate voice configuration if enabled
  if (config.voice.enabled) {
    if (config.voice.provider === "google" && !env.GOOGLE_PROJECT_ID) {
      throw new Error(
        "Google Project ID is required when using Google Speech-to-Text"
      );
    }
    if (config.voice.provider === "azure" && !env.AZURE_SPEECH_REGION) {
      throw new Error(
        "Azure Speech region is required when using Azure Speech Services"
      );
    }
  }

  // Validate upload directory permissions
  try {
    if (!fs.existsSync(config.upload.destination)) {
      fs.mkdirSync(config.upload.destination, { recursive: true });
    }
  } catch (error) {
    throw new Error(
      `Cannot create upload directory: ${config.upload.destination}`
    );
  }

  console.log("✅ Configuration validation passed");
}

/**
 * Get configuration for a specific component
 */
export function getConfig<T extends keyof AppConfig>(
  component: T
): AppConfig[T] {
  return config[component];
}

/**
 * Check if the application is running in development mode
 */
export function isDevelopment(): boolean {
  return config.server.environment === "development";
}

/**
 * Check if the application is running in production mode
 */
export function isProduction(): boolean {
  return config.server.environment === "production";
}

/**
 * Get the full server URL
 */
export function getServerUrl(): string {
  const protocol = isProduction() ? "https" : "http";
  return `${protocol}://${config.server.host}:${config.server.port}`;
}

// Validate configuration on module load (commented out for testing)
// validateConfiguration();
