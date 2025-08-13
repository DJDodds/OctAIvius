/**
 * Global type definitions for the AI Chatbot application
 * This file contains all the core interfaces and types used throughout the application
 */

// Base message types for chat functionality
export interface ChatMessage {
  id: string;
  sessionId: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: Date;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  isVoiceMessage?: boolean;
  audioUrl?: string;
  functionCalls?: FunctionCall[];
  mcpSource?: string;
  processingTime?: number;
  tokens?: {
    input: number;
    output: number;
  };
}

// Function calling system types
export interface FunctionCall {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  result?: any;
  error?: string;
  executionTime?: number;
  timestamp: Date;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
  handler: FunctionHandler;
  authorization?: AuthorizationRule[];
  timeout?: number;
  rateLimit?: RateLimitConfig;
}

export interface ParameterSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: any[];
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
}

export type FunctionHandler = (
  params: Record<string, any>,
  context: ExecutionContext
) => Promise<any>;

export interface ExecutionContext {
  userId: string;
  sessionId: string;
  timestamp: Date;
  requestId: string;
  permissions: string[];
}

// Authentication and authorization types
export interface User {
  id: string;
  username: string;
  email: string;
  roles: Role[];
  permissions: string[];
  createdAt: Date;
  lastLogin?: Date;
  isActive: boolean;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  description?: string;
}

export interface AuthorizationRule {
  permission: string;
  roles?: string[];
  customValidator?: (context: ExecutionContext) => boolean;
}

export interface JWTPayload {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
  iat: number;
  exp: number;
}

// Chat session management types
export interface ChatSession {
  id: string;
  userId: string;
  title?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  totalMessages: number;
  totalTokens: number;
  lastActivity: Date;
  voiceEnabled: boolean;
  mcpServers: string[];
  preferences: UserPreferences;
}

export interface UserPreferences {
  language: string;
  voiceLanguage: string;
  autoPlay: boolean;
  theme: "light" | "dark" | "auto";
  speechRate: number;
  speechPitch: number;
  speechVolume: number;
}

// Voice processing types
export interface AudioUpload {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  duration?: number;
  uploadedAt: Date;
  processedAt?: Date;
  transcription?: Transcription;
}

export interface Transcription {
  text: string;
  confidence: number;
  language: string;
  provider: "google" | "azure" | "whisper";
  alternatives?: TranscriptionAlternative[];
  processingTime: number;
}

export interface TranscriptionAlternative {
  text: string;
  confidence: number;
}

export interface VoiceConfig {
  enabled: boolean;
  provider: "google" | "azure" | "whisper";
  language: string;
  sampleRate: number;
  channels: number;
  encoding: string;
}

// MCP (Model Context Protocol) types
export interface MCPServer {
  id: string;
  name: string;
  url: string;
  status: "connected" | "disconnected" | "error" | "connecting";
  capabilities: MCPCapabilities;
  lastPing?: Date;
  errorCount: number;
  metadata: MCPServerMetadata;
}

export interface MCPCapabilities {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
  sampling: boolean;
  logging: boolean;
}

export interface MCPServerMetadata {
  version: string;
  description?: string;
  author?: string;
  connectionTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

export interface MCPMessage {
  id: string;
  method: string;
  params?: any;
  result?: any;
  error?: MCPError;
  timestamp: Date;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverId: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverId: string;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: ResponseMetadata;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  requestId: string;
}

export interface ResponseMetadata {
  requestId: string;
  timestamp: Date;
  processingTime: number;
  version: string;
}

// WebSocket event types
export interface ClientToServerEvents {
  "chat:message": (data: {
    content: string;
    sessionId: string;
    metadata?: Partial<MessageMetadata>;
  }) => void;

  "chat:typing": (data: { sessionId: string; isTyping: boolean }) => void;

  "voice:upload": (data: {
    audioData: ArrayBuffer;
    sessionId: string;
    format: string;
  }) => void;

  "session:join": (data: { sessionId: string; token: string }) => void;

  "session:leave": (data: { sessionId: string }) => void;
}

export interface ServerToClientEvents {
  "chat:message": (message: ChatMessage) => void;
  "chat:typing": (data: { isTyping: boolean; userId: string }) => void;
  "chat:error": (error: ApiError) => void;
  "voice:transcription": (transcription: Transcription) => void;
  "function:result": (result: FunctionCall) => void;
  "session:updated": (session: Partial<ChatSession>) => void;
  "server:status": (status: { connected: boolean; serverTime: Date }) => void;
}

// Configuration types
export interface AppConfig {
  server: ServerConfig;
  ai: AIConfig;
  auth: AuthConfig;
  voice: VoiceConfig;
  mcp: MCPConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
  upload: UploadConfig;
}

export interface ServerConfig {
  port: number;
  host: string;
  environment: "development" | "staging" | "production";
  corsOrigin: string | string[];
  trustProxy: boolean;
}

export interface AIConfig {
  provider: "anthropic" | "openai" | "gemini";
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: string;
  bcryptRounds: number;
  sessionTimeout: number;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
  connectionTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  timeout?: number;
  auth?: {
    type: "bearer" | "basic" | "api-key";
    credentials: Record<string, string>;
  };
}

export interface LoggingConfig {
  level: "error" | "warn" | "info" | "debug";
  file: {
    enabled: boolean;
    path: string;
    maxSize: string;
    maxFiles: number;
  };
  console: {
    enabled: boolean;
    colorize: boolean;
  };
}

export interface SecurityConfig {
  rateLimit: RateLimitConfig;
  cors: CorsConfig;
  helmet: HelmetConfig;
  upload: UploadSecurityConfig;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface CorsConfig {
  origin: string | string[];
  methods: string[];
  credentials: boolean;
  optionsSuccessStatus: number;
}

export interface HelmetConfig {
  contentSecurityPolicy: boolean;
  hsts: boolean;
  noSniff: boolean;
  xssFilter: boolean;
}

export interface UploadConfig {
  maxFileSize: number;
  allowedFormats: string[];
  destination: string;
  tempDirectory: string;
}

export interface UploadSecurityConfig {
  virusScanning: boolean;
  fileTypeValidation: boolean;
  maxFiles: number;
  quarantineDirectory: string;
}

// Health check types
export interface HealthCheck {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: Date;
  version: string;
  uptime: number;
  checks: ComponentHealth[];
}

export interface ComponentHealth {
  name: string;
  status: "healthy" | "unhealthy" | "degraded";
  responseTime?: number;
  error?: string;
  metadata?: Record<string, any>;
}

// Audit and monitoring types
export interface AuditLog {
  id: string;
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  error?: string;
}

export interface PerformanceMetrics {
  timestamp: Date;
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  cpuUsage: number;
}

// Error types
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date();

    // Capture stack trace if available (Node.js)
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

// Utility types
export type AsyncFunction<T = any> = (...args: any[]) => Promise<T>;
export type EventHandler<T = any> = (data: T) => void | Promise<void>;
export type Middleware = (
  req: any,
  res: any,
  next: any
) => void | Promise<void>;

// Express Request extension
declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: ChatSession;
      requestId: string;
      startTime: number;
    }
  }
}
