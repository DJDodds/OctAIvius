/**
 * Basic Main Electron process - simplified for initial functionality
 * Handles window management and basic IPC communication
 */

import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron";
import * as path from "path";
import * as fs from "fs";
import { config } from "./config";
import dotenv from "dotenv";
import { Logger } from "./utils/logger";
import { AIService } from "./services/aiService";
import { VoiceService } from "./services/voiceService";
import { MCPService } from "./services/mcpService";

// Load root .env for the Electron app
dotenv.config();

// Initialize logger for main process
const logger = new Logger("Main");

// Initialize services
const aiService = new AIService();
const voiceService = new VoiceService();
const mcpService = new MCPService();

// Staticaly register local Clip Player MCP server so it shows up in listServers
// Adjust path if project layout changes.
// Auto-detect build vs TS source for clipplayer MCP server
(() => {
  const clipRoot = path.resolve(
    "C:/Users/DXD07081/Stash/gv-ampp-clipplayer-mcp"
  );
  // Load a .env from the MCP server project, if present
  try {
    dotenv.config({ path: path.join(clipRoot, ".env") });
  } catch {}
  // Prefer compiled JS server to ensure stdio passthrough; fallback to npm start if not built.
  const builtJs = path.join(clipRoot, "out", "ClipPlayerMCPServer.js");
  let command: string;
  let args: string[];
  // For stability, run via npm start (ts-node path) so the server stays alive and uses stderr for logs.
  command = process.platform === "win32" ? "npm.cmd" : "npm";
  args = ["run", "start", "--silent"]; // server must not print to stdout

  // Build an env map for the child process (only include set values)
  const clipEnv: NodeJS.ProcessEnv = {};
  if (process.env.API_KEY) clipEnv.API_KEY = process.env.API_KEY;
  if (process.env.PLATFORM_URL) clipEnv.PLATFORM_URL = process.env.PLATFORM_URL;
  if (process.env.CLIPPLAYER_WORKLOAD_ID)
    clipEnv.CLIPPLAYER_WORKLOAD_ID = process.env.CLIPPLAYER_WORKLOAD_ID;
  mcpService.registerServerConfig({
    id: "clipplayer",
    name: "Clip Player",
    command,
    args,
    cwd: clipRoot,
    env: clipEnv,
    initTimeoutMs: 30000,
    autoRestart: true,
    restartBackoffMs: 3000,
    // Let the child wait for readiness logs before initialize
    skipInitialize: false,
    readyPattern: /ClipPlayer MCP Server started successfully/i,
    postSpawnDelayMs: 1500,
  });
})();

// Optional: bootstrap process-backed MCP servers from environment variables
// Example usage (PowerShell):
//   $env:MCP_SERVERS='[{"id":"local-fs","name":"Local FS","command":"node","args":["server.js"],"cwd":"C:/my/mcp"}]'
try {
  const raw = process.env.MCP_SERVERS;
  if (raw) {
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      list.forEach((cfg) => {
        if (cfg && cfg.id && cfg.command) {
          mcpService.registerServerConfig({
            id: cfg.id,
            name: cfg.name || cfg.id,
            command: cfg.command,
            args: cfg.args,
            cwd: cfg.cwd,
            env: cfg.env,
            autoRestart: cfg.autoRestart,
            restartBackoffMs: cfg.restartBackoffMs,
            initTimeoutMs: cfg.initTimeoutMs,
          });
        }
      });
    }
  }
} catch (e) {
  logger.warn("Failed to parse MCP_SERVERS env var", e as any);
}

/**
 * Main application class for Electron
 */
class GVAIBotApp {
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    logger.info("🚀 Initializing GVAIBot Electron Application");
    this.setupApp();
  }

  /**
   * Setup application event handlers
   */
  private setupApp(): void {
    // App event handlers
    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupIPC();
      this.setupMenu();

      // macOS: Re-create window when dock icon clicked
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    // Quit when all windows are closed (except on macOS)
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    // Handle app shutdown
    app.on("before-quit", async () => {
      logger.info("🔄 Shutting down GVAIBot application...");
      await this.cleanup();
    });
  }

  /**
   * Create the main application window
   */
  private createMainWindow(): void {
    logger.info("🖼️ Creating main window...");

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        sandbox: false,
        webSecurity: true,
      },
      show: false,
    });

    // Enable microphone permissions for speech recognition
    this.mainWindow.webContents.session.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        if (permission === "media") {
          logger.info(
            "🎤 Media permission requested and granted for speech recognition"
          );
          callback(true);
        } else {
          logger.warn(`⚠️ Permission requested: ${permission} - denied`);
          callback(false);
        }
      }
    );

    // Load the React HTML file
    const htmlPath = path.join(__dirname, "../dist/renderer/index.html");
    this.mainWindow.loadFile(htmlPath);

    // Show window when ready to prevent visual flash
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow?.show();
      logger.info("✅ Main window displayed");

      // Open DevTools in development
      if (config.server.environment === "development") {
        this.mainWindow?.webContents.openDevTools();
      }
    });

    // Handle window closed
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
      logger.info("🔄 Main window closed");
    });
  }

  /**
   * Setup IPC (Inter-Process Communication) handlers
   */
  private setupIPC(): void {
    logger.info("🔗 Setting up IPC handlers...");

    // Chat handler using AI service
    ipcMain.handle("chat:send-message", async (event, message: string) => {
      try {
        logger.info("💬 Processing chat message:", message);

        // Create a chat message object
        const chatMessage = {
          id: `msg_${Date.now()}`,
          sessionId: "default",
          content: message,
          role: "user" as const,
          timestamp: new Date(),
        };

        // Get AI response
        const response = await aiService.processMessage(message);
        logger.info("🤖 AI response generated successfully");

        return { success: true, response };
      } catch (error: any) {
        logger.error("❌ Error processing chat message:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    // API Key management
    ipcMain.handle(
      "ai:update-keys",
      async (
        event,
        keys: { openaiKey?: string; anthropicKey?: string; geminiKey?: string }
      ) => {
        try {
          logger.info("🔑 Updating AI API keys");
          await aiService.updateApiKeys(
            keys.openaiKey,
            keys.anthropicKey,
            keys.geminiKey
          );
          return { success: true };
        } catch (error: any) {
          logger.error("❌ Error updating API keys:", error);
          return { success: false, error: error?.message || "Unknown error" };
        }
      }
    );

    // Test API connection
    ipcMain.handle(
      "ai:test-connection",
      async (event, provider: "openai" | "anthropic") => {
        try {
          logger.info(`🔌 Testing ${provider} connection`);
          const isConnected = await aiService.testConnection(provider);
          logger.info(
            `🔌 ${provider} connection test result: ${
              isConnected ? "SUCCESS" : "FAILED"
            }`
          );
          return { success: true, connected: isConnected };
        } catch (error: any) {
          const errorMessage = error?.message || "Unknown error";
          logger.error(
            `❌ Error testing ${provider} connection:`,
            new Error(errorMessage)
          );

          // Return the specific error message for user feedback
          return {
            success: true, // We successfully got a response, just not connected
            connected: false,
            error: errorMessage,
          };
        }
      }
    );

    // App configuration
    ipcMain.handle("app:get-config", () => {
      return {
        success: true,
        config: {
          aiProvider: config.ai.provider,
          environment: config.server.environment,
        },
      };
    });

    // Voice processing handlers
    ipcMain.handle(
      "voice:process-audio",
      async (event, audioData: ArrayBuffer) => {
        try {
          logger.info("🎤 Processing voice audio");
          const buffer = Buffer.from(audioData);
          const result = await voiceService.processAudio(buffer);
          return { success: true, result };
        } catch (error: any) {
          logger.error("❌ Error processing voice audio:", error);
          return { success: false, error: error?.message || "Unknown error" };
        }
      }
    );

    ipcMain.handle("voice:start-recording", async () => {
      try {
        logger.info("🎤 Starting voice recording");
        await voiceService.startRecording();
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Error starting voice recording:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    ipcMain.handle("voice:stop-recording", async () => {
      try {
        logger.info("� Stopping voice recording");
        const transcript = await voiceService.stopRecording();
        return { success: true, transcript };
      } catch (error: any) {
        logger.error("❌ Error stopping voice recording:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    // MCP service handlers
    ipcMain.handle("mcp:list-servers", async () => {
      try {
        logger.info("📡 Listing MCP servers");
        const servers = await mcpService.listServers();
        return { success: true, servers };
      } catch (error: any) {
        logger.error("❌ Error listing MCP servers:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    ipcMain.handle("mcp:connect-server", async (event, serverId: string) => {
      try {
        logger.info("🔗 Connecting to MCP server:", serverId);
        await mcpService.connectServer(serverId);
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Error connecting to MCP server:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    ipcMain.handle(
      "mcp:call-function",
      async (event, serverId: string, functionName: string, args: any) => {
        try {
          logger.info("⚡ Calling MCP function:", { serverId, functionName });
          const result = await mcpService.callFunction(
            serverId,
            functionName,
            args
          );
          return { success: true, result };
        } catch (error: any) {
          logger.error("❌ Error calling MCP function:", error);
          return { success: false, error: error?.message || "Unknown error" };
        }
      }
    );

    // List tools for a connected server
    ipcMain.handle("mcp:list-tools", async (_e, serverId: string) => {
      try {
        const tools = await mcpService.listTools(serverId);
        return { success: true, tools };
      } catch (error: any) {
        logger.error("❌ Error listing MCP tools:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    // Disconnect a server
    ipcMain.handle("mcp:disconnect-server", async (_e, serverId: string) => {
      try {
        logger.info("🔌 Disconnecting MCP server:", serverId);
        await mcpService.disconnectServer(serverId);
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Error disconnecting MCP server:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    // Dynamically register a new process-backed MCP server from renderer
    ipcMain.handle("mcp:register-process-server", async (_e, cfg: any) => {
      try {
        if (!cfg || !cfg.id || !cfg.command) {
          throw new Error("id and command required");
        }
        logger.info("🆕 Registering MCP process server:", cfg.id);
        mcpService.registerServerConfig({
          id: cfg.id,
          name: cfg.name || cfg.id,
          command: cfg.command,
          args: cfg.args,
          cwd: cfg.cwd,
          env: cfg.env,
          autoRestart: cfg.autoRestart,
          restartBackoffMs: cfg.restartBackoffMs,
          initTimeoutMs: cfg.initTimeoutMs,
        });
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Error registering MCP process server:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    // (Removed incorrect renderer API usage here — registration must occur directly in main.)

    // Conversation management handlers
    ipcMain.handle("conversation:get-history", async () => {
      try {
        const history = aiService.getConversationHistory();
        return { success: true, history };
      } catch (error: any) {
        logger.error("❌ Error getting conversation history:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    ipcMain.handle("conversation:clear", async () => {
      try {
        aiService.clearConversationHistory();
        logger.info("🗑️ Conversation history cleared via IPC");
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Error clearing conversation history:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    // Internet connectivity check
    ipcMain.handle("network:check-connectivity", async () => {
      try {
        const { default: fetch } = await import("node-fetch");

        logger.info("🌐 Starting comprehensive internet connectivity check...");

        // Test multiple endpoints for reliability
        const testUrls = [
          "https://www.google.com",
          "https://speech.googleapis.com", // Google Speech API endpoint
          "https://1.1.1.1", // Cloudflare DNS
          "https://8.8.8.8", // Google DNS
        ];

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Network timeout after 5 seconds")),
            5000
          )
        );

        const results = [];
        let successCount = 0;

        for (const url of testUrls) {
          try {
            const startTime = Date.now();
            logger.info(`🌐 Testing connectivity to: ${url}`);

            const fetchPromise = fetch(url, {
              method: "HEAD",
              timeout: 3000,
              headers: {
                "User-Agent": "GVAIBot-Electron/1.0.0",
              },
            });

            const response = (await Promise.race([
              fetchPromise,
              timeoutPromise,
            ])) as any;
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            logger.info(
              `🌐 Successfully connected to ${url} (${responseTime}ms, status: ${
                response?.status || "unknown"
              })`
            );
            results.push({
              url,
              success: true,
              responseTime,
              status: response?.status || "unknown",
            });
            successCount++;

            // For speech API, return success immediately if Google services are reachable
            if (url.includes("google") || url.includes("speech")) {
              logger.info(`✅ Speech API connectivity confirmed via ${url}`);
              return {
                success: true,
                connected: true,
                speechApiReachable: true,
                results,
                primaryEndpoint: url,
              };
            }
          } catch (error: any) {
            const errorMsg = error?.message || "Unknown error";
            logger.debug(`⚠️ Failed to connect to ${url}: ${errorMsg}`);
            results.push({ url, success: false, error: errorMsg });
            continue;
          }
        }

        if (successCount > 0) {
          logger.info(
            `🌐 Internet connectivity confirmed (${successCount}/${testUrls.length} endpoints reachable)`
          );
          return {
            success: true,
            connected: true,
            speechApiReachable: results.some(
              (r) => r.url.includes("google") && r.success
            ),
            results,
            endpointsReachable: successCount,
          };
        }

        logger.warn(
          "❌ No internet connectivity detected - all endpoints failed"
        );
        return {
          success: true,
          connected: false,
          speechApiReachable: false,
          results,
          endpointsReachable: 0,
        };
      } catch (error: any) {
        logger.error("❌ Error checking internet connectivity:", error);
        return {
          success: false,
          connected: false,
          speechApiReachable: false,
          error: error?.message || "Unknown error",
        };
      }
    });

    logger.info("✅ IPC handlers setup completed");
  }

  /**
   * Cleanup services on app shutdown
   */
  private async cleanup(): Promise<void> {
    logger.info("🧹 Cleaning up services...");

    try {
      await voiceService.cleanup();
      await mcpService.cleanup();
      logger.info("✅ Services cleanup completed");
    } catch (error: any) {
      logger.error("❌ Error during cleanup:", error);
    }
  }

  /**
   * Setup basic application menu
   */
  private setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "File",
        submenu: [
          {
            label: "New Chat",
            accelerator: "CmdOrCtrl+N",
            click: () => {
              this.mainWindow?.webContents.send("chat:new");
            },
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    logger.info("✅ Application menu setup completed");
  }
}

// Create and initialize the application
const gvaiBotApp = new GVAIBotApp();

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("💥 Uncaught Exception");
  console.error(error);
  app.quit();
});

process.on("unhandledRejection", (reason) => {
  logger.error("💥 Unhandled Rejection");
  console.error(reason);
});
