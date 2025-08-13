/**
 * Main Application Entry Point
 *
 * This is the main entry point for the AI Chatbot application.
 * It sets up the Express server, WebSocket connections, middleware,
 * routes, and all core services.
 *
 * The application architecture follows these principles:
 * - Modular design with separation of concerns
 * - Comprehensive error handling and logging
 * - Security-first approach with multiple layers of protection
 * - Scalable design for handling multiple concurrent connections
 * - Real-time communication through WebSockets
 * - Integration with external AI services and MCP servers
 */

import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import * as path from "path";
import { config, validateConfiguration } from "./config/index";
import { defaultLogger, requestLogger, Logger } from "./utils/logger";
import {
  requestId,
  requestTiming,
  corsMiddleware,
  securityMiddleware,
  compressionMiddleware,
  rateLimitMiddleware,
  errorHandler,
  notFoundHandler,
  healthCheck,
} from "./middleware/index";
import { ClientToServerEvents, ServerToClientEvents } from "./types/index";

// Import route handlers (will be created next)
// import chatRoutes from './routes/chat';
// import audioRoutes from './routes/audio';
// import functionRoutes from './routes/functions';
// import mcpRoutes from './routes/mcp';

/**
 * Application class that encapsulates the entire server setup
 * This class manages the lifecycle of the application including:
 * - Express server configuration
 * - WebSocket server setup
 * - Middleware registration
 * - Route registration
 * - Graceful shutdown handling
 */
class Application {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  private logger: Logger;
  private isShuttingDown: boolean = false;

  constructor() {
    this.logger = defaultLogger;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.security.cors.origin,
        methods: config.security.cors.methods,
        credentials: config.security.cors.credentials,
      },
      transports: ["websocket", "polling"],
      allowEIO3: true,
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
    this.setupGracefulShutdown();
  }

  /**
   * Sets up Express middleware in the correct order
   * Order is important for proper request processing
   */
  private setupMiddleware(): void {
    this.logger.info("Setting up middleware...");

    // Trust proxy for accurate client IP when behind reverse proxy
    if (config.server.trustProxy) {
      this.app.set("trust proxy", 1);
    }

    // Security and utility middleware (applied first)
    this.app.use(securityMiddleware);
    this.app.use(corsMiddleware);
    this.app.use(compressionMiddleware);

    // Request processing middleware
    this.app.use(requestId);
    this.app.use(requestTiming);
    this.app.use(requestLogger());

    // Body parsing middleware
    this.app.use(
      express.json({
        limit: "10mb",
        strict: true,
      })
    );
    this.app.use(
      express.urlencoded({
        extended: true,
        limit: "10mb",
      })
    );

    // Static file serving for the frontend
    const publicPath = "./public";
    this.app.use(
      express.static(publicPath, {
        maxAge: "1d", // Cache static files for 1 day
        etag: true,
        lastModified: true,
      })
    );

    // Rate limiting (applied after static files to not limit asset requests)
    this.app.use("/api", rateLimitMiddleware);

    this.logger.info("✅ Middleware setup completed");
  }

  /**
   * Sets up API routes and endpoints
   * Routes are organized by functional area
   */
  private setupRoutes(): void {
    this.logger.info("Setting up routes...");

    // Health check endpoint (no rate limiting)
    this.app.get("/health", healthCheck);
    this.app.get("/api/health", healthCheck);

    // API routes will be added here
    // this.app.use('/api/chat', chatRoutes);
    // this.app.use('/api/audio', audioRoutes);
    // this.app.use('/api/functions', functionRoutes);
    // this.app.use('/api/mcp', mcpRoutes);

    // Temporary placeholder routes for development
    this.app.get("/api/status", (req: any, res: any) => {
      res.json({
        success: true,
        data: {
          status: "running",
          version: "1.0.0",
          environment: config.server.environment,
          timestamp: new Date(),
        },
      });
    });

    // Serve the main application for SPA routing
    this.app.get("*", (req: any, res: any) => {
      res.sendFile("./public/index.html");
    });

    this.logger.info("✅ Routes setup completed");
  }

  /**
   * Sets up WebSocket server for real-time communication
   * Handles client connections, message routing, and error handling
   */
  private setupWebSocket(): void {
    this.logger.info("Setting up WebSocket server...");

    // Middleware for socket authentication
    this.io.use((socket: any, next: any) => {
      const token = socket.handshake.auth.token;

      if (!token) {
        this.logger.warn("WebSocket connection attempted without token", {
          socketId: socket.id,
          ip: socket.handshake.address,
        });
        return next(new Error("Authentication token required"));
      }

      // TODO: Verify JWT token and attach user info
      // For now, we'll skip authentication
      next();
    });

    // Handle client connections
    this.io.on("connection", (socket: any) => {
      const socketLogger = this.logger.child(socket.id);

      socketLogger.info("Client connected", {
        socketId: socket.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers["user-agent"],
      });

      // Handle chat messages
      socket.on("chat:message", async (data: any) => {
        try {
          socketLogger.info("Chat message received", {
            sessionId: data.sessionId,
            contentLength: data.content.length,
          });

          // TODO: Process chat message with AI service
          // For now, echo the message back
          socket.emit("chat:message", {
            id: `msg_${Date.now()}`,
            sessionId: data.sessionId,
            content: `Echo: ${data.content}`,
            role: "assistant",
            timestamp: new Date(),
            metadata: {
              processingTime: 100,
            },
          });
        } catch (error) {
          socketLogger.error("Error processing chat message", error as Error, {
            sessionId: data.sessionId,
          });

          socket.emit("chat:error", {
            code: "CHAT_ERROR",
            message: "Failed to process message",
            timestamp: new Date(),
            requestId: socket.id,
          });
        }
      });

      // Handle typing indicators
      socket.on("chat:typing", (data: any) => {
        socketLogger.debug("Typing indicator received", {
          sessionId: data.sessionId,
          isTyping: data.isTyping,
        });

        // Broadcast typing indicator to other clients in the session
        socket.to(data.sessionId).emit("chat:typing", {
          isTyping: data.isTyping,
          userId: "current_user", // TODO: Get from authenticated user
        });
      });

      // Handle voice uploads
      socket.on("voice:upload", async (data: any) => {
        try {
          socketLogger.info("Voice upload received", {
            sessionId: data.sessionId,
            format: data.format,
            size: data.audioData.byteLength,
          });

          // TODO: Process audio with speech-to-text service
          // For now, send a mock transcription
          socket.emit("voice:transcription", {
            text: "Mock transcription of audio content",
            confidence: 0.95,
            language: "en-US",
            provider: "mock",
            processingTime: 500,
          });
        } catch (error) {
          socketLogger.error("Error processing voice upload", error as Error, {
            sessionId: data.sessionId,
          });

          socket.emit("chat:error", {
            code: "VOICE_ERROR",
            message: "Failed to process voice upload",
            timestamp: new Date(),
            requestId: socket.id,
          });
        }
      });

      // Handle session management
      socket.on("session:join", (data: any) => {
        socketLogger.info("Client joining session", {
          sessionId: data.sessionId,
        });

        socket.join(data.sessionId);
        socket.emit("session:updated", {
          id: data.sessionId,
          isActive: true,
          updatedAt: new Date(),
        });
      });

      socket.on("session:leave", (data: any) => {
        socketLogger.info("Client leaving session", {
          sessionId: data.sessionId,
        });

        socket.leave(data.sessionId);
      });

      // Handle disconnection
      socket.on("disconnect", (reason: any) => {
        socketLogger.info("Client disconnected", {
          reason,
          socketId: socket.id,
        });
      });

      // Handle connection errors
      socket.on("error", (error: any) => {
        socketLogger.error("Socket error occurred", error, {
          socketId: socket.id,
        });
      });

      // Send server status to newly connected client
      socket.emit("server:status", {
        connected: true,
        serverTime: new Date(),
      });
    });

    this.logger.info("✅ WebSocket server setup completed");
  }

  /**
   * Sets up error handling middleware
   * Must be called after all routes are defined
   */
  private setupErrorHandling(): void {
    this.logger.info("Setting up error handling...");

    // 404 handler for API routes
    this.app.use("/api/*", notFoundHandler);

    // Global error handler (must be last)
    this.app.use(errorHandler);

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      this.logger.error("Uncaught exception occurred", error);
      this.gracefulShutdown("SIGTERM");
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      this.logger.error("Unhandled promise rejection", reason as Error, {
        promise: promise.toString(),
      });
      this.gracefulShutdown("SIGTERM");
    });

    this.logger.info("✅ Error handling setup completed");
  }

  /**
   * Sets up graceful shutdown handling
   * Ensures the application shuts down cleanly when receiving termination signals
   */
  private setupGracefulShutdown(): void {
    // Handle termination signals
    process.on("SIGTERM", () => this.gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => this.gracefulShutdown("SIGINT"));

    this.logger.info("✅ Graceful shutdown handlers registered");
  }

  /**
   * Performs graceful shutdown of the application
   * Closes all connections and releases resources properly
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn("Shutdown already in progress, forcing exit...");
      process.exit(1);
    }

    this.isShuttingDown = true;
    this.logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Set shutdown timeout
    const shutdownTimeout = setTimeout(() => {
      this.logger.error("Graceful shutdown timeout, forcing exit");
      process.exit(1);
    }, 10000); // 10 second timeout

    try {
      // Close WebSocket connections
      this.logger.info("Closing WebSocket connections...");
      this.io.close();

      // Close HTTP server
      this.logger.info("Closing HTTP server...");
      await new Promise<void>((resolve, reject) => {
        this.server.close((error: any) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      // TODO: Close database connections, external service connections, etc.

      clearTimeout(shutdownTimeout);
      this.logger.info("✅ Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      clearTimeout(shutdownTimeout);
      this.logger.error("Error during graceful shutdown", error as Error);
      process.exit(1);
    }
  }

  /**
   * Starts the application server
   * Begins listening for HTTP and WebSocket connections
   */
  public async start(): Promise<void> {
    try {
      // Validate configuration before starting
      validateConfiguration();

      // Start the server
      await new Promise<void>((resolve, reject) => {
        this.server.listen(
          config.server.port,
          config.server.host,
          (error: any) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          }
        );
      });

      this.logger.info("🚀 Server started successfully", {
        port: config.server.port,
        host: config.server.host,
        environment: config.server.environment,
        processId: process.pid,
      });

      // Log configuration details
      this.logger.info("📋 Configuration loaded", {
        aiProvider: config.ai.provider,
        voiceEnabled: config.voice.enabled,
        logLevel: config.logging.level,
        nodeEnv: config.server.environment,
      });
    } catch (error) {
      this.logger.error("Failed to start server", error as Error);
      process.exit(1);
    }
  }

  /**
   * Gets the Express application instance
   * Useful for testing and external integrations
   */
  public getApp(): express.Application {
    return this.app;
  }

  /**
   * Gets the Socket.IO server instance
   * Useful for external integrations that need to emit events
   */
  public getSocketServer(): SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents
  > {
    return this.io;
  }
}

/**
 * Create and start the application
 * This is the main execution block
 */
async function bootstrap(): Promise<void> {
  const logger = defaultLogger;

  try {
    logger.info("🔄 Starting AI Chatbot application...");
    logger.info(`Node.js version: ${process.version}`);
    logger.info(`Environment: ${config.server.environment}`);

    // Create and start the application
    const app = new Application();
    await app.start();
  } catch (error) {
    logger.error("Failed to bootstrap application", error as Error);
    process.exit(1);
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error("Bootstrap failed:", error);
    process.exit(1);
  });
}

// Export for testing and external use
export { Application, bootstrap };
