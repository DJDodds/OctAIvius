/**
 * Basic Main Electron process - simplified for initial functionality
 * Handles window management and basic IPC communication
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  nativeImage,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { config } from "./config";
import dotenv from "dotenv";
import { Logger } from "./utils/logger";
import { AIService } from "./services/aiService";
import { VoiceService } from "./services/voiceService";
import { MCPService } from "./services/mcpService";
import { OpenAIRealtimeService } from "./services/realtime/openaiRealtime";

// Load root .env for the Electron app
dotenv.config();

// Initialize logger for main process
const logger = new Logger("Main");

// Initialize services
const aiService = new AIService();
const voiceService = new VoiceService();
const mcpService = new MCPService();
let realtimeService: OpenAIRealtimeService | null = null;

// Resolve app/window icon path across dev and packaged builds
function getIconPath(): string | undefined {
  // Prefer a consistent filename used by electron-builder config
  const devCandidates = [
    path.join(__dirname, "..", "assets", "icon.ico"),
    path.join(__dirname, "..", "assets", "favicon2021.ico"),
  ];
  const prodCandidates = [
    path.join(process.resourcesPath, "assets", "icon.ico"),
    path.join(process.resourcesPath, "assets", "favicon2021.ico"),
  ];
  const candidates = app.isPackaged ? prodCandidates : devCandidates;
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {}
  }
  return undefined;
}

// Statically register local AMPP MCP Server so it shows up in listServers
// Adjust path if project layout changes.
// Auto-detect build vs TS source for the MCP server
(() => {
  const clipRoot = path.resolve(
    "C:/Users/DXD07081/Stash/gv-ampp-clipplayer-mcp"
  );
  // Load a .env from the MCP server project, if present
  try {
    dotenv.config({ path: path.join(clipRoot, ".env") });
  } catch {}
  // Prefer compiled JS entry to ensure clean stdio; fallback to npm start if not built.
  const builtEntry = path.join(clipRoot, "out", "index.js");
  let command: string;
  let args: string[];
  if (fs.existsSync(builtEntry)) {
    command = process.platform === "win32" ? "node.exe" : "node"; // run with Node, not Electron
    args = [builtEntry];
  } else {
    // Fallback: run via npm start (ts-node). Note: npm may interfere with stdio; build project to prefer direct node when possible.
    command = process.platform === "win32" ? "npm.cmd" : "npm";
    args = ["run", "start", "--silent"]; // server must not print to stdout
  }

  // Build an env map for the child process (only include set values)
  const clipEnv: NodeJS.ProcessEnv = {};
  if (process.env.API_KEY) clipEnv.API_KEY = process.env.API_KEY;
  if (process.env.PLATFORM_URL) clipEnv.PLATFORM_URL = process.env.PLATFORM_URL;
  if (process.env.CLIPPLAYER_WORKLOAD_ID)
    clipEnv.CLIPPLAYER_WORKLOAD_ID = process.env.CLIPPLAYER_WORKLOAD_ID;
  mcpService.registerServerConfig({
    id: "clipplayer",
    name: "AMPP MCP Server",
    command,
    args,
    cwd: clipRoot,
    env: clipEnv,
    initTimeoutMs: 30000,
    autoRestart: true,
    restartBackoffMs: 3000,
    // Let the child wait for readiness logs before initialize
    skipInitialize: false,
    // Updated for both generic and ClipPlayer server logs
    readyPattern:
      /(Generic (?:AMPP )?MCP server|ClipPlayer MCP server) (?:running on stdio|started successfully)/i,
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
      // Ensure Windows properly associates the app (and taskbar icon)
      if (process.platform === "win32") {
        try {
          app.setAppUserModelId("com.gvaibot.app");
          logger.info("🪟 AppUserModelID set to com.gvaibot.app");
        } catch (e) {
          logger.warn("Failed to set AppUserModelID", e as any);
        }
      }
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

    logger.info("Directory name");
    logger.info(__dirname);
    const iconPath = getIconPath();
    if (iconPath) {
      logger.info(`🖼️ Using window icon: ${iconPath}`);
    } else {
      logger.warn(
        "⚠️ No window icon found. Checked ./assets/icon.ico and ./assets/favicon2021.ico"
      );
    }
    const winOpts: Electron.BrowserWindowConstructorOptions = {
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      // Frameless window (custom header)
      frame: false,
      // Hide the default menu bar for a more app-like look
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        sandbox: false,
        webSecurity: true,
      },
      show: false,
    };
    if (iconPath) {
      winOpts.icon = iconPath;
    }
    this.mainWindow = new BrowserWindow(winOpts);
    // On some Windows setups, explicitly setting the icon post-creation helps the taskbar update
    if (iconPath) {
      try {
        const img = nativeImage.createFromPath(iconPath);
        if (!img.isEmpty()) {
          this.mainWindow.setIcon(img);
        }
      } catch (e) {
        logger.warn("Failed to set icon via nativeImage", e as any);
      }
    }

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

    // Attach window to realtime service if already created
    if (realtimeService) {
      realtimeService.attachWindow(this.mainWindow);
    }

    // Show window when ready to prevent visual flash
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow?.show();
      logger.info("✅ Main window displayed");

      // Open DevTools in development
      if (config.server.environment === "development") {
        this.mainWindow?.webContents.openDevTools();
      }

      // Auto-connect to the AMPP MCP Server on first window ready
      (async () => {
        try {
          logger.info("🛰️ Auto-connecting to MCP server: clipplayer");
          await mcpService.connectServer("clipplayer");
          // Warm the tools list
          try {
            await mcpService.listTools("clipplayer");
          } catch {}
          this.broadcastMcpServersUpdated({
            serverId: "clipplayer",
            status: "connected",
          });
        } catch (e) {
          logger.warn("⚠️ Auto-connect failed for clipplayer", e as any);
          this.broadcastMcpServersUpdated({
            serverId: "clipplayer",
            status: "error",
          });
        }
      })();
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
    const broadcast = (payload: { serverId: string; status: string }) =>
      this.broadcastMcpServersUpdated(payload);
    logger.info("🔗 Setting up IPC handlers...");

    // Window controls
    ipcMain.handle("window:close", async () => {
      try {
        const win = BrowserWindow.getFocusedWindow() || this.mainWindow;
        win?.close();
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Error closing window:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

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

        // Try broader NL intent routing for MCP (no slash required)
        const ensureServer = async (serverId: string) => {
          try {
            if (!mcpService.isServerConnected(serverId)) {
              await mcpService.connectServer(serverId);
            }
          } catch (e) {
            logger.error("Failed to ensure MCP connection:", e as any);
          }
        };

        const serverId = "clipplayer";

        // Extract a JSON object (if present) from the message
        const extractJson = (s: string): { obj?: any; error?: string } => {
          const start = s.indexOf("{");
          const end = s.lastIndexOf("}");
          if (start >= 0 && end > start) {
            const json = s.slice(start, end + 1);
            try {
              return { obj: JSON.parse(json) };
            } catch (e: any) {
              return { error: "Invalid JSON payload" };
            }
          }
          return {};
        };

        // Helper to call MCP and normalize text return
        const call = async (tool: string, args: any = {}) => {
          await ensureServer(serverId);
          const res = await mcpService.callFunction(serverId, tool, args);
          const text =
            typeof res?.content?.[0]?.text === "string"
              ? res.content[0].text
              : JSON.stringify(res);
          return { success: true, response: text };
        };

        // Helper: MCP guidance if user intent mentions AMPP/ClipPlayer but no specific pattern matched
        const mcpGuidance = async () => {
          try {
            await ensureServer(serverId);
            // Best-effort: warm tools list (ignoring errors)
            try {
              await mcpService.listTools(serverId);
            } catch {}
          } catch {}
          const guidance = [
            "I can help with AMPP and Clip Player controls. Try:",
            "- list all application types",
            "- get the schemas for <app>",
            "- list the commands for <app>",
            "- show the schema for <app>.<command>",
            "- suggest a payload for <app>.<command>",
            "- list workloads for <app>",
            "- set clipplayer workload to <workloadId>",
            "- play | pause | seek 100 | set rate 2 | shuttle -4",
            "- show clipplayer examples",
          ].join("\n");
          return { success: true, response: guidance };
        };

        // Helper: curated ClipPlayer/AMPP examples (from server docs)
        const mcpExamplesText = () => {
          return [
            "Examples (tools/call):",
            "\nClipPlayer tools:",
            '{"tool":"load_clip","arguments":{"file":"S3://my-bucket/video.mp4"}}',
            '{"tool":"load_clip","arguments":{"clipId":"01GSY8CK27A1AW12W8C1V66HJXC"}}',
            '{"tool":"play_pause","arguments":{}}',
            '{"tool":"seek","arguments":{"frame":1000}}',
            '{"tool":"set_rate","arguments":{"rate":2.0}}',
            '{"tool":"shuttle","arguments":{"rate":-2.0}}',
            '{"tool":"transport_command","arguments":{"position":100,"inPosition":10,"outPosition":200,"rate":1.0,"endBehaviour":"loop"}}',
            '{"tool":"goto_start","arguments":{}}',
            '{"tool":"goto_end","arguments":{}}',
            '{"tool":"step_forward","arguments":{}}',
            '{"tool":"step_back","arguments":{}}',
            '{"tool":"mark_in","arguments":{}}',
            '{"tool":"mark_out","arguments":{}}',
            '{"tool":"fast_forward","arguments":{}}',
            '{"tool":"rewind","arguments":{}}',
            '{"tool":"loop","arguments":{}}',
            '{"tool":"get_state","arguments":{}}',
            '{"tool":"clear_assets","arguments":{}}',
            "\nAMPP tools:",
            '{"tool":"ampp_list_workloads","arguments":{"applicationType":"ClipPlayer"}}',
            '{"tool":"ampp_list_workload_names","arguments":{"applicationType":"ClipPlayer"}}',
            '{"tool":"set_active_workload","arguments":{"applicationType":"ClipPlayer","workloadId":"your-workload-id"}}',
            '{"tool":"get_active_workload","arguments":{"applicationType":"ClipPlayer"}}',
            '{"tool":"ampp_refresh_application_schemas","arguments":{}}',
            '{"tool":"ampp_list_commands_for_application","arguments":{"applicationType":"ClipPlayer","includeSummary":true}}',
            '{"tool":"ampp_show_command_schema","arguments":{"applicationType":"ClipPlayer","command":"play"}}',
            '{"tool":"ampp_get_command_doc","arguments":{"applicationType":"ClipPlayer","command":"play","format":"markdown"}}',
            '{"tool":"ampp_invoke","arguments":{"applicationType":"ClipPlayer","workloadId":"your-workload-id","command":"controlstate","payload":{"Index":1,"Program":true}}}',
          ].join("\n");
        };

        // Quick examples on request
        if (
          /\b(examples|usage|how to)\b.*\b(clipplayer|mcp|ampp)\b/i.test(
            message
          ) ||
          /\b(clipplayer|mcp|ampp)\b.*\b(examples|usage)\b/i.test(message)
        ) {
          logger.info("ℹ️ Providing curated MCP examples text");
          return { success: true, response: mcpExamplesText() };
        }

        // AMPP schema and commands
        let m;
        if (
          (m = message.match(/get (?:me )?(?:the )?schemas for\s+([\w.-]+)/i))
        ) {
          logger.info("🧩 NL route -> ampp_list_commands_for_application", {
            app: m[1],
          });
          const app = m[1];
          try {
            await ensureServer(serverId);
            await mcpService.callFunction(
              serverId,
              "ampp_refresh_application_schemas",
              {}
            );
          } catch {}
          return await call("ampp_list_commands_for_application", {
            applicationType: app,
          });
        }
        if (
          (m = message.match(
            /list (?:the )?commands for\s+([\w.-]+)(?:\s+with\s+summaries?)?/i
          ))
        ) {
          logger.info("🧩 NL route -> ampp_list_commands_for_application", {
            app: m[1],
          });
          const includeSummary = /with\s+summaries?/i.test(message);
          return await call("ampp_list_commands_for_application", {
            applicationType: m[1],
            includeSummary,
          });
        }
        if (
          (m = message.match(/show (?:the )?schema for\s+([\w.-]+)\.(\w+)/i))
        ) {
          logger.info("🧩 NL route -> ampp_show_command_schema", {
            app: m[1],
            command: m[2],
          });
          return await call("ampp_show_command_schema", {
            applicationType: m[1],
            command: m[2],
          });
        }
        if (
          (m = message.match(/suggest (?:a )?payload for\s+([\w.-]+)\.(\w+)/i))
        ) {
          logger.info("🧩 NL route -> ampp_suggest_payload", {
            app: m[1],
            command: m[2],
          });
          return await call("ampp_suggest_payload", {
            applicationType: m[1],
            command: m[2],
          });
        }
        if (/^list (?:all )?application types/i.test(message)) {
          logger.info("🧩 NL route -> ampp_list_application_types");
          return await call("ampp_list_application_types");
        }
        // Workloads discovery
        if (
          (m = message.match(
            /list(?:\s+all)?\s+workloads(?:\s+for\s+([\w.-]+))?/i
          ))
        ) {
          const app = m[1]?.trim();
          if (app) {
            logger.info("🧩 NL route -> ampp_list_workloads", { app });
            return await call("ampp_list_workloads", { applicationType: app });
          }
          logger.info("🧩 NL route -> ampp_list_all_workloads");
          return await call("ampp_list_all_workloads", {});
        }
        if (
          (m = message.match(/list (?:all )?workload names for\s+([\w.-]+)/i))
        ) {
          logger.info("🧩 NL route -> ampp_list_workload_names", { app: m[1] });
          return await call("ampp_list_workload_names", {
            applicationType: m[1],
          });
        }
        if (/list (?:all )?clip ?players/i.test(message)) {
          logger.info("🧩 NL route -> ampp_list_workload_names (ClipPlayer)");
          return await call("ampp_list_workload_names", {
            applicationType: "ClipPlayer",
          });
        }
        if ((m = message.match(/set clipplayer workload to\s+([\w-]+)/i))) {
          logger.info("🧩 NL route -> set_active_workload (ClipPlayer)", {
            workloadId: m[1],
          });
          return await call("set_active_workload", {
            applicationType: "ClipPlayer",
            workloadId: m[1],
          });
        }
        if (/get clipplayer workload/i.test(message)) {
          logger.info("🧩 NL route -> get_active_workload (ClipPlayer)");
          return await call("get_active_workload", {
            applicationType: "ClipPlayer",
          });
        }
        if (
          (m = message.match(
            /set active workload for\s+([\w.-]+)\s+to\s+([\w-]+)/i
          ))
        ) {
          logger.info("🧩 NL route -> set_active_workload", {
            app: m[1],
            workloadId: m[2],
          });
          return await call("set_active_workload", {
            applicationType: m[1],
            workloadId: m[2],
          });
        }
        if ((m = message.match(/get active workload for\s+([\w.-]+)/i))) {
          logger.info("🧩 NL route -> get_active_workload", { app: m[1] });
          return await call("get_active_workload", { applicationType: m[1] });
        }
        if (
          (m = message.match(
            /invoke\s+([\w.-]+)\.(\w+)\s+(?:with )?({[\s\S]*})/i
          ))
        ) {
          const app = m[1],
            cmd = m[2];
          const { obj, error } = extractJson(m[0]);
          if (error) return { success: true, response: error };
          logger.info("🧩 NL route -> ampp_invoke", { app, command: cmd });
          return await call("ampp_invoke", {
            applicationType: app,
            command: cmd,
            payload: obj || {},
          });
        }
        if (
          (m = message.match(
            /send control message .*?workload\s+([\w-]+).*?app(?:lication)?\s+([\w.-]+).*?(?:schema|command)\s+(\w+)/i
          ))
        ) {
          const { obj } = extractJson(message);
          logger.info(
            "🧩 NL route -> ampp_invoke (from NL 'send control message')",
            { workloadId: m[1], app: m[2], command: m[3] }
          );
          return await call("ampp_invoke", {
            workloadId: m[1],
            applicationType: m[2],
            command: m[3],
            payload: obj || {},
          });
        }
        if ((m = message.match(/get ampp state for\s+([\w-]+)/i))) {
          logger.info(
            "ℹ️ NL route deprecated -> ampp_get_state (no longer available)",
            { workloadId: m[1] }
          );
          return {
            success: true,
            response:
              "'ampp_get_state' has been removed. Use 'ampp_list_commands_for_application' to discover app commands, then 'ampp_invoke' or 'ampp_get_command_doc' for details.",
          };
        }
        if (/list macros/i.test(message)) {
          logger.info("🧩 NL route -> ampp_list_macros");
          return await call("ampp_list_macros");
        }
        if ((m = message.match(/execute macro\s+(.+)/i))) {
          const name = m && m[1] ? m[1].trim() : "";
          if (!name) {
            return { success: true, response: "Please provide a macro name." };
          }
          logger.info("🧩 NL route -> ampp_execute_macro_by_name", { name });
          return await call("ampp_execute_macro_by_name", { name });
        }

        // ClipPlayer controls
        if (
          (m = message.match(
            /load clip(?:\s+(?:file|from file)\s+(.+)|\s+id\s+([\w-]+)|\s+(.+))/i
          ))
        ) {
          const file = (m[1] || m[3] || "").trim();
          const clipId = m[2];
          const args = clipId ? { clipId } : file ? { file } : {};
          return await call("load_clip", args);
        }
        if (/^(?:play|pause)\b/i.test(message)) {
          return await call("play_pause");
        }
        if ((m = message.match(/seek (?:to )?(?:frame )?(\d+)/i))) {
          return await call("seek", { frame: Number(m[1]) });
        }
        if (
          (m = message.match(
            /(?:set )?(?:rate|speed|playback rate) (?:to )?(-?\d+(?:\.\d+)?)/i
          ))
        ) {
          return await call("set_rate", { rate: Number(m[1]) });
        }
        if (/go to start|^start$/i.test(message)) {
          return await call("goto_start");
        }
        if (/go to end|^end$/i.test(message)) {
          return await call("goto_end");
        }
        if (/step forward/i.test(message)) {
          return await call("step_forward");
        }
        if (/step back|step backward/i.test(message)) {
          return await call("step_back");
        }
        if (/mark in/i.test(message)) {
          return await call("mark_in");
        }
        if (/mark out/i.test(message)) {
          return await call("mark_out");
        }
        if (/fast ?forward/i.test(message)) {
          return await call("fast_forward");
        }
        if (/rewind/i.test(message)) {
          return await call("rewind");
        }
        if (/^loop\b|toggle loop/i.test(message)) {
          return await call("loop");
        }
        if ((m = message.match(/shuttle (?:at|to)?\s*(-?\d+(?:\.\d+)?)/i))) {
          return await call("shuttle", { rate: Number(m[1]) });
        }
        if (/get state/i.test(message)) {
          return await call("get_state");
        }
        if (/clear assets/i.test(message)) {
          return await call("clear_assets");
        }
        if (
          (m = message.match(
            /set transport (?:(?:position|pos)\s*(\d+))?(?:.*?in\s*(\d+))?(?:.*?out\s*(\d+))?(?:.*?rate\s*(-?\d+(?:\.\d+)?))?(?:.*?(loop|repeat|recue))?/i
          ))
        ) {
          const [, pos, inPos, outPos, rate, endb] = m;
          const args: any = {};
          if (pos) args.position = Number(pos);
          if (inPos) args.inPosition = Number(inPos);
          if (outPos) args.outPosition = Number(outPos);
          if (rate) args.rate = Number(rate);
          if (endb) args.endBehaviour = endb as any;
          return await call("transport_command", args);
        }
        if ((m = message.match(/set state to\s*(play|pause)/i))) {
          return await call("transport_state", { state: m[1] });
        }

        // If message looks MCP-related but didn't match a specific pattern, provide guidance
        if (
          /(\bampp\b|clip ?player|workload|schema|schemas|macro|transport|play\b|pause\b|seek\b|rate\b|shuttle\b)/i.test(
            message
          )
        ) {
          logger.info(
            "ℹ️ MCP intent detected but no specific NL pattern matched; returning guidance."
          );
          return await mcpGuidance();
        }

        // Get AI response (default)
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

    // Realtime (OpenAI) handlers
    ipcMain.handle(
      "realtime:start",
      async (_e, opts: { model?: string; voice?: string } = {}) => {
        try {
          const key =
            process.env.OPENAI_API_KEY ||
            (config.ai.provider === "openai" ? config.ai.apiKey : undefined);
          if (!key) throw new Error("OPENAI_API_KEY not configured");
          // Basic sanity check for likely invalid keys (e.g., mistakenly using a Google key)
          if (/^AIza[0-9A-Za-z_-]{35}$/.test(key)) {
            logger.warn(
              "The provided OPENAI_API_KEY looks like a Google API key (starts with AIza...). Realtime will fail to connect."
            );
          }
          if (!realtimeService) {
            realtimeService = new OpenAIRealtimeService(this.mainWindow, opts);
          } else {
            realtimeService.attachWindow(this.mainWindow);
          }
          realtimeService.setApiKey(key);
          // Hook transcript callback into chat/MCP pipeline
          realtimeService.setTranscriptHandler(async (text: string) => {
            try {
              // Reuse existing chat routing (this will NL-route to MCP as needed)
              const res = await (async () => {
                try {
                  const out = await aiService.processMessage(text);
                  return { success: true, response: out };
                } catch (e: any) {
                  return { success: false, error: e?.message || String(e) };
                }
              })();
              const reply = res.success
                ? res.response
                : `Error: ${res.error}`;
              // Speak the reply via Realtime
              if (typeof reply === "string") {
                realtimeService?.createAudioResponse({ instructions: reply });
              } else {
                realtimeService?.createAudioResponse();
              }
              // Also emit to renderer as assistant text message
              this.mainWindow?.webContents.send("chat:assistant-message", {
                content: reply,
                source: "realtime",
              });
            } catch (e) {
              logger.error("Realtime transcript pipeline failed", e as any);
            }
          });
          await realtimeService.start();
          return { success: true };
        } catch (error: any) {
          logger.error("❌ Realtime start failed", error);
          return { success: false, error: error?.message || "Unknown error" };
        }
      }
    );

    ipcMain.handle("realtime:stop", async () => {
      try {
        realtimeService?.stop();
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Realtime stop failed", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    ipcMain.handle(
      "realtime:append-audio-base64",
      async (
        _e,
        payload: { audioBase64: string; sampleRate?: number } | null
      ) => {
        try {
          if (!payload?.audioBase64) {
            return { success: false, error: "audioBase64 is required" };
          }
          if (!realtimeService) {
            // Quietly drop audio until the service starts to avoid log spam
            return { success: false, error: "not-started" };
          }
          const hasSr = typeof payload.sampleRate === "number";
          if (hasSr) {
            realtimeService.appendAudioBase64(payload.audioBase64, {
              sampleRate: payload.sampleRate as number,
            });
          } else {
            realtimeService.appendAudioBase64(payload.audioBase64);
          }
          return { success: true };
        } catch (error: any) {
          logger.debug("Realtime append failed", error);
          return { success: false, error: error?.message || "Unknown error" };
        }
      }
    );

    ipcMain.handle(
      "realtime:commit",
      async (_e, params?: { instructions?: string }) => {
        try {
          if (!realtimeService)
            throw new Error("Realtime service is not started");
          // Only commit; the transcript handler will drive chat + response
          realtimeService.commitOnly();
          return { success: true };
        } catch (error: any) {
          logger.error("❌ Realtime commit failed", error);
          return { success: false, error: error?.message || "Unknown error" };
        }
      }
    );

    // Allow renderer to ask Realtime to speak arbitrary text
    ipcMain.handle(
      "realtime:create-audio-response",
      async (_e, params?: { instructions?: string }) => {
        try {
          if (!realtimeService)
            throw new Error("Realtime service is not started");
          realtimeService.createAudioResponse(params);
          return { success: true };
        } catch (error: any) {
          logger.error("❌ Realtime createAudioResponse failed", error);
          return { success: false, error: error?.message || "Unknown error" };
        }
      }
    );

    ipcMain.handle("realtime:send", async (_e, ev: any) => {
      try {
        if (!realtimeService)
          throw new Error("Realtime service is not started");
        realtimeService.sendEvent(ev || {});
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Realtime send failed", error);
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
        broadcast({ serverId, status: "connected" });
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Error connecting to MCP server:", error);
        broadcast({ serverId, status: "error" });
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

    // Optional: explicit schema bootstrap from renderer
    ipcMain.handle("mcp:bootstrap-schemas", async (_e, serverId: string) => {
      try {
        logger.info(
          `🧩 Bootstrapping schemas for ${serverId} (renderer request)`
        );
        await (mcpService as any).bootstrapSchemas?.(serverId);
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Error bootstrapping schemas:", error);
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    // Disconnect a server
    ipcMain.handle("mcp:disconnect-server", async (_e, serverId: string) => {
      try {
        logger.info("🔌 Disconnecting MCP server:", serverId);
        await mcpService.disconnectServer(serverId);
        broadcast({ serverId, status: "disconnected" });
        return { success: true };
      } catch (error: any) {
        logger.error("❌ Error disconnecting MCP server:", error);
        broadcast({ serverId, status: "error" });
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

  // Notify renderer(s) that MCP servers changed status
  private broadcastMcpServersUpdated(payload: {
    serverId: string;
    status: string;
  }) {
    try {
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send("mcp:servers-updated", payload);
      });
    } catch (e) {
      logger.warn("Failed to broadcast mcp:servers-updated", e as any);
    }
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
    // Remove the application menu entirely for a clean, app-like UI.
    // Note: Standard OS shortcuts (e.g., Ctrl+X/C/V) still work.
    Menu.setApplicationMenu(null);
    logger.info("✅ Application menu removed (clean UI mode)");
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
