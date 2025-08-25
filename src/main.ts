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
// Pending disambiguation state for parameter-based invocations (by sessionId)
type PendingParamOp = {
  app: string;
  workloadName: string;
  param: string;
  valueRaw: string;
  candidates: string[]; // command names
  matchedParamByCommand?: Record<string, string>; // exact key (case/path) per command
};
const pendingParamOps: Record<string, PendingParamOp | undefined> = {};

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
    id: "ampp",
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
          logger.info("🛰️ Auto-connecting to MCP server: ampp");
          await mcpService.connectServer("ampp");
          // Warm the tools list
          try {
            await mcpService.listTools("ampp");
          } catch {}
          this.broadcastMcpServersUpdated({
            serverId: "ampp",
            status: "connected",
          });
        } catch (e) {
          logger.warn("⚠️ Auto-connect failed for ampp", e as any);
          this.broadcastMcpServersUpdated({
            serverId: "ampp",
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
      // Track if handler returned successfully for final complete event
      const opId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      let opOk = true;
      try {
        logger.info("💬 Processing chat message:", message);

        // Progress helper with operation id for grouping in UI
        // opId declared above for use in finally
        const progress = (
          step: string,
          state: "start" | "done" | "error",
          info?: any
        ) => {
          try {
            event.sender.send("chat:progress", {
              step,
              state,
              info,
              ts: Date.now(),
              opId,
            });
          } catch {}
        };

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

        const serverId = "ampp";

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

        // Normalize command tokens like 'control@1.0' -> 'control'
        const normalizeCmd = (cmd: string) =>
          String(cmd || "").replace(/@\d+(?:\.\d+)*$/i, "");

        // Clean up workload name captured from NL (strip stray quotes and trailing words like 'with')
        const sanitizeWorkloadName = (raw: string): string => {
          let s = String(raw || "").trim();
          // remove surrounding quotes (one or many)
          s = s.replace(/^"+/, "").replace(/"+$/, "");
          // remove dangling hints before payload
          s = s.replace(/\s+with(?:\s+payload)?\s*$/i, "");
          // remove any remaining quotes
          s = s.replace(/"/g, "");
          return s.trim();
        };

        // Helper to call MCP and normalize text return
        const call = async (tool: string, args: any = {}) => {
          const isInvoke = /ampp_invoke/i.test(tool);
          const timeoutMs =
            tool === "ampp_refresh_application_schemas"
              ? 30000
              : /^(ampp_list_workload_names|ampp_list_workloads|ampp_list_all_workloads|ampp_list_commands_for_application|ampp_list_application_types)$/i.test(
                  tool
                )
              ? 30000
              : isInvoke
              ? 15000
              : 12000;
          const infoBrief = {
            tool,
            applicationType: args?.applicationType,
            workloadId: args?.workloadId,
            workloadName: args?.workloadName,
            command: args?.command,
            payloadBytes: args?.payload
              ? Buffer.byteLength(JSON.stringify(args.payload))
              : 0,
          };
          progress("tools-call", "start", infoBrief);
          if (isInvoke) progress("invoke", "start", infoBrief);
          const wasConnected = mcpService.isServerConnected(serverId);
          if (!wasConnected) progress("mcp-connect", "start");
          await ensureServer(serverId);
          if (!wasConnected) progress("mcp-connect", "done");
          if (isInvoke) {
            // Emit preview of invoke args
            try {
              const maxLen = 2000;
              const preview = args?.payload;
              const payloadPreview =
                typeof preview === "object"
                  ? JSON.stringify(preview)
                  : String(preview || "");
              progress("invoke-args", "start", {
                applicationType: args?.applicationType,
                workloadName: args?.workloadName,
                workloadId: args?.workloadId,
                command: args?.command,
                payload: args?.payload || {},
                payloadPreview:
                  payloadPreview.length > maxLen
                    ? payloadPreview.slice(0, maxLen) + "..."
                    : payloadPreview,
              });
            } catch {}
          }
          if (tool === "ampp_refresh_application_schemas") {
            progress("refresh-schemas", "start");
          }
          try {
            const res = await mcpService.callFunction(serverId, tool, args, {
              timeoutMs,
            });
            const text =
              typeof res?.content?.[0]?.text === "string"
                ? res.content[0].text
                : JSON.stringify(res);
            if (tool === "ampp_refresh_application_schemas") {
              progress("refresh-schemas", "done");
            }
            progress("tools-call", "done", infoBrief);
            if (isInvoke) progress("invoke", "done", infoBrief);
            return { success: true, response: text };
          } catch (e: any) {
            const errMsg = e?.message || String(e);
            if (tool === "ampp_refresh_application_schemas") {
              progress("refresh-schemas", "error", { error: errMsg });
            }
            progress("tools-call", "error", { ...infoBrief, error: errMsg });
            if (isInvoke)
              progress("invoke", "error", { ...infoBrief, error: errMsg });
            return {
              success: true,
              response: `Error calling ${tool}: ${errMsg}`,
            };
          }
        };

        // Lightweight fuzzy matching for suggestions
        const levenshtein = (a: string, b: string) => {
          a = (a || "").toLowerCase();
          b = (b || "").toLowerCase();
          const m = a.length;
          const n = b.length;
          if (m === 0) return n;
          if (n === 0) return m;
          const dp = new Array(n + 1).fill(0);
          for (let j = 0; j <= n; j++) dp[j] = j;
          for (let i = 1; i <= m; i++) {
            let prev = i - 1;
            dp[0] = i;
            for (let j = 1; j <= n; j++) {
              const temp = dp[j];
              const cost = a[i - 1] === b[j - 1] ? 0 : 1;
              dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
              prev = temp;
            }
          }
          return dp[n];
        };
        const rankClosest = (needle: string, hay: string[]) => {
          const list = hay.map((h) => ({
            value: h,
            score:
              levenshtein(needle, h) +
              (h.toLowerCase().startsWith(needle.toLowerCase()) ? -0.25 : 0) +
              (h.toLowerCase().includes(needle.toLowerCase()) ? -0.15 : 0),
          }));
          return list.sort((a, b) => a.score - b.score).map((x) => x.value);
        };
        const listAppTypes = async (): Promise<string[]> => {
          try {
            await ensureServer(serverId);
            const res = await mcpService.callFunction(
              serverId,
              "ampp_list_application_types",
              {},
              { timeoutMs: 12000 }
            );
            const text =
              typeof res?.content?.[0]?.text === "string"
                ? res.content[0].text
                : "";
            // Expect newline-delimited or JSON array; try both
            if (text.trim().startsWith("[")) {
              const arr = JSON.parse(text);
              return Array.isArray(arr) ? arr.map((x: any) => String(x)) : [];
            }
            return text
              .split(/\r?\n/)
              .map((s: string) => s.trim())
              .filter(Boolean);
          } catch {
            return [];
          }
        };
        const listCommands = async (app: string): Promise<string[]> => {
          try {
            await ensureServer(serverId);
            const res = await mcpService.callFunction(
              serverId,
              "ampp_list_commands_for_application",
              { applicationType: app, includeSummary: false },
              { timeoutMs: 15000 }
            );
            const text =
              typeof res?.content?.[0]?.text === "string"
                ? res.content[0].text
                : "";
            // If server returned JSON array, parse it
            if (text.trim().startsWith("[")) {
              try {
                const arr = JSON.parse(text);
                if (Array.isArray(arr)) {
                  return arr
                    .map((v: any) => String(v))
                    .map((s: string) => s.trim().replace(/,$/, ""))
                    .filter(Boolean);
                }
              } catch {}
            }
            // Fallback: parse lines and strip bullets/commas/quotes
            const items = text
              .split(/\r?\n/)
              .map((s: string) => s.trim())
              .filter(Boolean)
              .map((line: string) =>
                line
                  .replace(/^[*-]\s*/, "")
                  .replace(/,$/, "")
                  .replace(/^"|"$/g, "")
              )
              .map((line: string) => line.split(/\s+/)[0])
              .filter((s: string) => Boolean(s) && !/^[\[\]]$/.test(s));
            return items;
          } catch {
            return [];
          }
        };

        // Helper: list parameters for a specific command (robust: text or JSON schema)
        const listParamsForCommand = async (
          app: string,
          cmd: string
        ): Promise<string[]> => {
          try {
            await ensureServer(serverId);
            const tryOnce = async (commandToken: string) =>
              mcpService.callFunction(
                serverId,
                "ampp_get_parameters",
                { applicationType: app, command: normalizeCmd(commandToken) },
                { timeoutMs: 30000 }
              );
            let res: any;
            try {
              res = await tryOnce(cmd);
            } catch {
              res = await tryOnce(normalizeCmd(cmd));
            }
            const text =
              typeof res?.content?.[0]?.text === "string"
                ? res.content[0].text
                : "";
            // If server responded with not-found text, retry once with normalized command if not already
            if (
              /Command not found|app not cached|Not cached/i.test(text) &&
              cmd !== normalizeCmd(cmd)
            ) {
              try {
                const res2 = await tryOnce(normalizeCmd(cmd));
                const txt2 =
                  typeof res2?.content?.[0]?.text === "string"
                    ? res2.content[0].text
                    : "";
                if (txt2) {
                  // replace
                  (res as any) = res2;
                }
              } catch {}
            }
            const out: string[] = [];
            const add = (k?: string) => {
              const s = String(k || "").trim();
              if (!s) return;
              if (!out.includes(s)) out.push(s);
            };
            const blacklist =
              /^(command|description|summary|parameters?|returns?|schema|request|payload|input|body|example|examples)$/i;
            // Resolve local JSON Schema $ref like #/$defs/X or #/definitions/X or #/components/schemas/X
            const resolveRef = (ref: string, root: any): any => {
              if (!ref || typeof ref !== "string" || !ref.startsWith("#"))
                return undefined;
              const path = ref.replace(/^#\/?/, "").split("/").filter(Boolean);
              let cur: any = root;
              for (const seg of path) {
                if (!cur || typeof cur !== "object") return undefined;
                cur = cur[seg];
              }
              return cur;
            };
            const collectFromSchema = (
              schema: any,
              prefix = "",
              root?: any
            ) => {
              if (!schema || typeof schema !== "object") return;
              // Follow $ref if present
              if (typeof schema.$ref === "string" && root) {
                const target = resolveRef(schema.$ref, root);
                if (target && typeof target === "object") {
                  collectFromSchema(target, prefix, root);
                }
              }
              if (schema.properties && typeof schema.properties === "object") {
                for (const key of Object.keys(schema.properties)) {
                  add(prefix ? `${prefix}.${key}` : key);
                  collectFromSchema(
                    schema.properties[key],
                    prefix ? `${prefix}.${key}` : key,
                    root
                  );
                }
              }
              if (Array.isArray(schema.required)) {
                // required keys are already covered by properties, but keep for completeness
                schema.required.forEach((k: any) =>
                  add(prefix ? `${prefix}.${k}` : String(k))
                );
              }
              if (schema.items) {
                collectFromSchema(schema.items, prefix, root);
              }
              if (schema.oneOf || schema.anyOf || schema.allOf) {
                const arr = schema.oneOf || schema.anyOf || schema.allOf;
                if (Array.isArray(arr))
                  arr.forEach((s: any) => collectFromSchema(s, prefix, root));
              }
            };
            const tryParseJsonFromText = (raw: string): any | undefined => {
              let s = (raw || "").trim();
              s = s.replace(/^```[a-zA-Z]*\n?/i, "").replace(/```\s*$/i, "");
              // direct parse
              if (
                (s.startsWith("{") && s.endsWith("}")) ||
                (s.startsWith("[") && s.endsWith("]"))
              ) {
                try {
                  return JSON.parse(s);
                } catch {}
              }
              // heuristics: largest braces region
              const fi = s.indexOf("{");
              const li = s.lastIndexOf("}");
              if (fi >= 0 && li > fi) {
                const sub = s.slice(fi, li + 1);
                try {
                  return JSON.parse(sub);
                } catch {}
              }
              const fa = s.indexOf("[");
              const la = s.lastIndexOf("]");
              if (fa >= 0 && la > fa) {
                const sub = s.slice(fa, la + 1);
                try {
                  return JSON.parse(sub);
                } catch {}
              }
              return undefined;
            };
            // Try JSON parsing first (array or object schema)
            let trimmed = text.trim();
            // Strip markdown code fences if present
            trimmed = trimmed
              .replace(/^```[a-zA-Z]*\n?/i, "")
              .replace(/```\s*$/i, "");
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
              try {
                const json = JSON.parse(trimmed);
                const unwrapDeep = (obj: any): any => {
                  if (!obj || typeof obj !== "object") return obj;
                  // peel top-level schema
                  if (obj.schema) return unwrapDeep(obj.schema);
                  // common request envelopes
                  if (obj.request) {
                    const r = obj.request;
                    if (r.body) return unwrapDeep(r.body);
                    if (r.payload) return unwrapDeep(r.payload);
                    if (r.input) return unwrapDeep(r.input);
                    return unwrapDeep(r);
                  }
                  // direct alternate envelopes
                  if (obj.body) return unwrapDeep(obj.body);
                  if (obj.payload) return unwrapDeep(obj.payload);
                  if (obj.input) return unwrapDeep(obj.input);
                  if (obj.parameters) return unwrapDeep(obj.parameters);
                  return obj;
                };
                if (Array.isArray(json)) {
                  // array of strings or objects
                  json.forEach((it: any) => {
                    if (typeof it === "string") add(it);
                    else if (it && typeof it === "object")
                      add(it.name || it.param || it.parameter || it.key);
                  });
                } else if (json && typeof json === "object") {
                  // assume JSON schema shape
                  const inner = unwrapDeep(json);
                  if (Array.isArray(inner)) {
                    inner.forEach((it: any) => {
                      if (typeof it === "string") add(it);
                      else if (it && typeof it === "object")
                        add(it.name || it.param || it.parameter || it.key);
                    });
                  } else {
                    collectFromSchema(inner, "", json);
                  }
                }
              } catch {
                // fallthrough to text parsing
              }
            }
            if (out.length) return out;
            // Try embedded JSON within text
            try {
              const maybe = tryParseJsonFromText(trimmed);
              if (maybe) {
                if (Array.isArray(maybe)) {
                  maybe.forEach((it: any) => {
                    if (typeof it === "string") add(it);
                    else if (it && typeof it === "object")
                      add(it.name || it.param || it.parameter || it.key);
                  });
                } else if (maybe && typeof maybe === "object") {
                  collectFromSchema(maybe, "", maybe);
                }
              }
            } catch {}
            if (out.length) return out.filter((k) => !blacklist.test(k));
            // Fallback: parse lines and extract token before ':' or first word
            trimmed
              .split(/\r?\n/)
              .map((s: string) => s.trim())
              .filter(Boolean)
              .forEach((line: string) => {
                const cleaned = line.replace(/^[*-]\s*/, "");
                const m = cleaned.match(/^([^:\s]+)\s*:/);
                add(m ? m[1] : cleaned.split(/\s+/)[0]);
              });
            if (out.length) return out.filter((k) => !blacklist.test(k));
            // Fallback 2: parse simple markdown tables "| Param | Type | ..."; collect first column (skipping header/sep)
            try {
              const lines = trimmed.split(/\r?\n/).map((l: string) => l.trim());
              const tableRows = lines.filter(
                (l: string) => /\|/.test(l) && !/^\|?\s*-+\s*\|/.test(l)
              );
              if (tableRows.length) {
                for (const row of tableRows) {
                  const cells = row
                    .split("|")
                    .map((c: string) => c.trim())
                    .filter((c: string) => c.length > 0);
                  if (cells.length >= 1) {
                    const first = cells[0];
                    if (!/^(parameter|param|name|field)$/i.test(first))
                      add(first);
                  }
                }
              }
            } catch {}
            if (out.length) return out.filter((k) => !blacklist.test(k));
            // Ultimate fallback: fetch full command schema and parse
            try {
              const schemaRes = await mcpService.callFunction(
                serverId,
                "ampp_show_command_schema",
                { applicationType: app, command: normalizeCmd(cmd) },
                { timeoutMs: 30000 }
              );
              const sText =
                typeof schemaRes?.content?.[0]?.text === "string"
                  ? schemaRes.content[0].text
                  : "";
              let sTrim = sText
                .trim()
                .replace(/^```[a-zA-Z]*\n?/i, "")
                .replace(/```\s*$/i, "");
              if (sTrim.startsWith("{") || sTrim.startsWith("[")) {
                try {
                  const parsed = JSON.parse(sTrim);
                  const unwrapDeep = (obj: any): any => {
                    if (!obj || typeof obj !== "object") return obj;
                    if (obj.schema) return unwrapDeep(obj.schema);
                    if (obj.request) {
                      const r = obj.request;
                      if (r.body) return unwrapDeep(r.body);
                      if (r.payload) return unwrapDeep(r.payload);
                      if (r.input) return unwrapDeep(r.input);
                      return unwrapDeep(r);
                    }
                    if (obj.body) return unwrapDeep(obj.body);
                    if (obj.payload) return unwrapDeep(obj.payload);
                    if (obj.input) return unwrapDeep(obj.input);
                    if (obj.parameters) return unwrapDeep(obj.parameters);
                    return obj;
                  };
                  const inner = unwrapDeep(parsed);
                  collectFromSchema(inner, "", parsed);
                } catch {}
              } else {
                const maybe = tryParseJsonFromText(sTrim);
                if (maybe) {
                  const unwrapDeep = (obj: any): any => {
                    if (!obj || typeof obj !== "object") return obj;
                    if ((obj as any).schema)
                      return unwrapDeep((obj as any).schema);
                    if ((obj as any).request) {
                      const r = (obj as any).request;
                      if (r.body) return unwrapDeep(r.body);
                      if (r.payload) return unwrapDeep(r.payload);
                      if (r.input) return unwrapDeep(r.input);
                      return unwrapDeep(r);
                    }
                    if ((obj as any).body) return unwrapDeep((obj as any).body);
                    if ((obj as any).payload)
                      return unwrapDeep((obj as any).payload);
                    if ((obj as any).input)
                      return unwrapDeep((obj as any).input);
                    if ((obj as any).parameters)
                      return unwrapDeep((obj as any).parameters);
                    return obj;
                  };
                  const inner = unwrapDeep(maybe);
                  collectFromSchema(inner, "", maybe);
                }
              }
            } catch {}
            return out.filter((k) => !blacklist.test(k));
          } catch {
            return [];
          }
        };

        const coerceValue = (raw: string): any => {
          const s = (raw || "")
            .trim()
            .replace(/^"|"$/g, "")
            .replace(/^'|'$/g, "");
          if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
          if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
          return s;
        };

        const suggestAndInvokeWithParam = async (
          app: string,
          workloadName: string,
          cmd: string,
          paramKeyToUse: string,
          valueRaw: string
        ) => {
          await ensureServer(serverId);
          // Build a minimal payload: only the requested parameter (avoid adding optional fields)
          const cmdNorm = normalizeCmd(cmd);
          const finalPayload: any = {};
          const setDeep = (obj: any, pathStr: string, val: any) => {
            const parts = pathStr.split(".").filter(Boolean);
            let cur = obj;
            for (let i = 0; i < parts.length - 1; i++) {
              const k = parts[i]!;
              if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
              cur = cur[k];
            }
            cur[parts[parts.length - 1] as string] = val;
          };
          setDeep(finalPayload, paramKeyToUse, coerceValue(valueRaw));
          try {
            progress("payload-suggest", "done", {
              app,
              command: cmd,
              suggested: finalPayload,
            });
          } catch {}
          // Optional: attempt validation (ignore failures, we still try to invoke)
          try {
            await mcpService.callFunction(
              serverId,
              "ampp_validate_payload",
              { applicationType: app, command: cmdNorm, payload: finalPayload },
              { timeoutMs: 8000 }
            );
          } catch {}
          try {
            progress("payload-override", "done", {
              param: paramKeyToUse,
              value: coerceValue(valueRaw),
            });
          } catch {}
          const args = {
            applicationType: app,
            workloadName,
            command: cmdNorm,
            payload: finalPayload,
          } as const;
          try {
            progress("invoke-attempt", "start", { args });
          } catch {}
          const result = await call("ampp_invoke_by_workload_name", {
            ...args,
          });
          const respText = String((result as any)?.response || "");
          if (/Command not found|app not cached/i.test(respText)) {
            try {
              progress("invoke-retry", "start", { reason: "cache-miss" });
            } catch {}
            try {
              await mcpService.callFunction(
                serverId,
                "ampp_refresh_application_schemas",
                {},
                { timeoutMs: 20000 }
              );
            } catch {}
            const args2 = { ...args, command: normalizeCmd(cmd) };
            try {
              progress("invoke-attempt", "start", { args: args2 });
            } catch {}
            return await call("ampp_invoke_by_workload_name", args2);
          }
          return result;
        };
        // Resolve pending selection for parameter-change flow
        const sessionId = chatMessage.sessionId;
        const pending = pendingParamOps[sessionId];
        if (pending) {
          // If user mentions one of the candidate command names, proceed
          const mention = pending.candidates.find((c) =>
            new RegExp(`\\b${c}\\b`, "i").test(message)
          );
          if (mention) {
            delete pendingParamOps[sessionId];
            logger.info("🧩 Resuming param-change flow with chosen command", {
              command: mention,
            });
            const key =
              pending.matchedParamByCommand?.[mention] || pending.param;
            return await suggestAndInvokeWithParam(
              pending.app,
              pending.workloadName,
              mention,
              key,
              pending.valueRaw
            );
          }
          // If not matched, gently prompt again listing options
          return {
            success: true,
            response: `Please specify which command to use for parameter "${
              pending.param
            }": ${pending.candidates.join(", ")}`,
          };
        }

        // New NL route: multi-parameter update in one go
        // Examples:
        //  - set Program to true and Index to 1 on MiniMixer "DanDMMaws"
        //  - change Preview=false, Program=true for MiniMixer "DanDMMaws"
        {
          const mm = message.match(
            /(?:set|change|update)\s+((?:[A-Za-z0-9_.-]+\s*(?:=|to)\s*(?:"[^"]+"|'[^']+'|[^,]+?)(?:\s*(?:,|\s+and\s+)\s*)?)+)\s+(?:on|for|in)\s+([\w.-]+)\s+(?:"([^"]+)"|(.+?))\s*$/i
          );
          if (mm) {
            const assignmentsRaw = String(mm[1] || "");
            const app: string = String(mm[2] || "");
            const workloadName = sanitizeWorkloadName(String(mm[3] || mm[4] || ""));
            // Parse pairs like: Param to Value, Param=Value, separated by comma or 'and'
            const pairRe = /([A-Za-z0-9_.-]+)\s*(?:=|to)\s*("[^"]+"|'[^']+'|[^,]+?)(?=\s*(?:,|\s+and\s+|$))/gi;
            const pairs: Array<{ name: string; valueRaw: string }> = [];
            let pm: RegExpExecArray | null;
            while ((pm = pairRe.exec(assignmentsRaw))) {
              const name = (pm[1] || "").trim();
              let val = (pm[2] || "").trim();
              // strip surrounding quotes
              val = val.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
              pairs.push({ name, valueRaw: val });
            }
            if (!pairs.length) {
              return { success: true, response: "Couldn't parse any parameter assignments." };
            }
            logger.info("🧩 NL route -> multi-param update", { app, workloadName, pairs });
            try { progress("param-scan", "start", { app, workloadName, param: pairs.map(p=>p.name).join(", ") }); } catch {}

            await ensureServer(serverId);
            try { await mcpService.callFunction(serverId, "ampp_refresh_application_schemas", {}, { timeoutMs: 20000 }); } catch {}

            const cmds = await listCommands(app);
            if (!cmds.length) {
              return { success: true, response: `No commands found for ${app}. Try 'list the commands for ${app}'.` };
            }

            // Helper: find best match for a requested param within a params list
            const matchParam = (wanted: string, params: string[]): { key?: string | undefined; score: number } => {
              const w = wanted.toLowerCase();
              const aliases = new Set<string>([w]);
              if (w === "color" || w === "colour") {
                ["colour","color","colorspace","colourspace","color space","colour space"].forEach(a=>aliases.add(a));
              }
              let best: { key?: string | undefined; score: number } = { key: undefined, score: 0 };
              for (const p of params) {
                const low = p.toLowerCase();
                const tail = p.split(".").pop()!.toLowerCase();
                // exact
                if (aliases.has(low)) { if (best.score < 3) best = { key: p, score: 3 }; continue; }
                // tail exact
                if (aliases.has(tail)) { if (best.score < 2) best = { key: p, score: 2 }; continue; }
                // contains
                for (const a of aliases) {
                  if (low.includes(a) || tail.includes(a)) { if (best.score < 1) best = { key: p, score: 1 }; break; }
                }
              }
              return best;
            };

            // Preload params for each command once
            const paramsByCmd: Record<string, string[]> = {};
            for (let i = 0; i < cmds.length; i++) {
              const c = cmds[i]!;
              try { progress("param-scan-cmd", "start", { command: c, index: i+1, total: cmds.length }); } catch {}
              const params = await listParamsForCommand(app, c);
              paramsByCmd[c] = params;
              try { progress("param-scan-cmd", "done", { command: c, index: i+1, total: cmds.length, params }); } catch {}
            }

            // Find command with maximum coverage
            let bestCmd: string | undefined;
            let bestCoverage = -1;
            let bestScoreSum = -1;
            let bestMatches: Record<string, string> = {};
            for (const c of cmds) {
              const params = paramsByCmd[c] || [];
              let covered = 0; let sum = 0; const map: Record<string,string> = {};
              for (const pair of pairs) {
                const { key, score } = matchParam(pair.name, params);
                if (key) { covered++; sum += score; map[pair.name] = key; }
              }
              if (covered > bestCoverage || (covered === bestCoverage && sum > bestScoreSum)) {
                bestCoverage = covered; bestScoreSum = sum; bestCmd = c; bestMatches = map;
              }
            }

            const setDeep = (obj: any, pathStr: string, val: any) => {
              const parts = String(pathStr||"").split(".").filter(Boolean);
              let cur = obj; for (let i=0;i<parts.length-1;i++){ const k=parts[i]!; if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {}; cur = cur[k]; }
              cur[parts[parts.length-1] as string] = val;
            };

            const invokeOne = async (command: string, groupPairs: Array<{name:string; valueRaw:string}>) => {
              const cmdNorm = normalizeCmd(command);
              const finalPayload: any = {};
              for (const pr of groupPairs) {
                const matchedKey = (paramsByCmd[command] ? matchParam(pr.name, paramsByCmd[command]!).key : undefined) || pr.name;
                setDeep(finalPayload, matchedKey, coerceValue(pr.valueRaw));
                try { progress("payload-override", "done", { param: matchedKey, value: coerceValue(pr.valueRaw) }); } catch {}
              }
              try { progress("payload-suggest", "done", { app, command: cmdNorm, suggested: finalPayload }); } catch {}
              // validate (best effort)
              try { await mcpService.callFunction(serverId, "ampp_validate_payload", { applicationType: app, command: cmdNorm, payload: finalPayload }, { timeoutMs: 8000 }); } catch {}
              // invoke with retry
              const args = { applicationType: app, workloadName, command: cmdNorm, payload: finalPayload } as const;
              try { progress("invoke-attempt", "start", { args }); } catch {}
              const result = await call("ampp_invoke_by_workload_name", { ...args });
              const respText = String((result as any)?.response || "");
              if (/Command not found|app not cached/i.test(respText)) {
                try { progress("invoke-retry", "start", { reason: "cache-miss" }); } catch {}
                try { await mcpService.callFunction(serverId, "ampp_refresh_application_schemas", {}, { timeoutMs: 20000 }); } catch {}
                const args2 = { ...args, command: normalizeCmd(command) };
                try { progress("invoke-attempt", "start", { args: args2 }); } catch {}
                return await call("ampp_invoke_by_workload_name", args2);
              }
              return result;
            };

            // If best command covers all pairs, do one invoke
            if (bestCmd && bestCoverage === pairs.length) {
              const orderedPairs = pairs.map(p => ({ name: bestMatches[p.name] || p.name, valueRaw: p.valueRaw }));
              const res = await invokeOne(bestCmd, orderedPairs);
              return res;
            }

            // Else, group pairs by best command per param and invoke per group
            const groupByCmd: Record<string, Array<{name:string; valueRaw:string}>> = {};
            for (const pr of pairs) {
              let bestForParam: { cmd?: string; score: number; key?: string | undefined } = { score: -1 };
              for (const c of cmds) {
                const m = matchParam(pr.name, paramsByCmd[c] || []);
                if (m.score > bestForParam.score) bestForParam = { cmd: c, score: m.score, key: m.key };
              }
              const fallbackCmd = bestCmd || (cmds.length ? cmds[0]! : undefined);
              const chosenCmd = (bestForParam.cmd || fallbackCmd) as string;
              if (!groupByCmd[chosenCmd]) groupByCmd[chosenCmd] = [];
              groupByCmd[chosenCmd]!.push({ name: bestForParam.key || pr.name, valueRaw: pr.valueRaw });
            }

            const results: string[] = [];
            for (const [cmdName, group] of Object.entries(groupByCmd)) {
              const r = await invokeOne(cmdName, group);
              results.push(String((r as any)?.response || ""));
            }
            return { success: true, response: results.join("\n") };
          }
        }

        // New NL route: parameter-based invoke discovery
        // Example: "invoke change color parameter on testsignalgenerator \"DanDTSG2 1\" to Blue"
        {
          const mm = message.match(
            /(?:invoke|set|change|update)\s+(?:the\s+)?([A-Za-z0-9_.-]+)\s+(?:parameter|param|field)\s+(?:on|for|in)\s+([\w.-]+)\s+(?:"([^"]+)"|(.+?))\s+(?:to|=)\s+(.+)$/i
          );
          if (mm) {
            const param: string = String(mm[1] ?? "");
            const app: string = String(mm[2] ?? "");
            const workloadName: string = String(mm[3] ?? mm[4] ?? "").trim();
            const valueRaw: string = String(mm[5] ?? "").trim();
            logger.info("🧩 NL route -> param-change discovery", {
              app,
              param,
              workloadName,
              valueRaw,
            });
            try {
              progress("param-scan", "start", {
                app,
                param,
                workloadName,
                valueRaw,
              });
            } catch {}
            try {
              await ensureServer(serverId);
              await mcpService.callFunction(
                serverId,
                "ampp_refresh_application_schemas",
                {},
                { timeoutMs: 20000 }
              );
            } catch {}
            // 1) Discover commands for the app
            const cmds = await listCommands(app);
            try {
              progress("param-candidates", "done", { commands: cmds });
            } catch {}
            if (!cmds.length) {
              return {
                success: true,
                response: `No commands found for ${app}. Try 'list the commands for ${app}'.`,
              };
            }
            // 2) Scan each command's parameters for a match
            const matches: string[] = [];
            const matchedParamByCommand: Record<string, string> = {};
            const wanted = param.toLowerCase();
            const aliases = new Set<string>([wanted]);
            // handle color/colour common alias + variants
            if (wanted === "color" || wanted === "colour") {
              [
                "colour",
                "color",
                "colorspace",
                "colourspace",
                "color space",
                "colour space",
                "colorspace",
                "colourspace",
              ].forEach((a) => aliases.add(a));
            }
            const allParams: string[] = [];
            for (let i = 0; i < cmds.length; i++) {
              const c = cmds[i]!;
              try {
                progress("param-scan-cmd", "start", {
                  command: c,
                  index: i + 1,
                  total: cmds.length,
                });
              } catch {}
              const params = await listParamsForCommand(app, c);
              try {
                progress("param-scan-cmd", "done", {
                  command: c,
                  index: i + 1,
                  total: cmds.length,
                  params,
                });
              } catch {}
              if (!params.length) continue;
              for (const p of params)
                if (!allParams.includes(p)) allParams.push(p);
              // prefer exact case-insensitive match; else contains; also try aliases and nested paths
              let chosen: string | undefined;
              for (const p of params) {
                const low = p.toLowerCase();
                if (aliases.has(low)) {
                  chosen = p;
                  break;
                }
                // support nested path: key or trailing segment matches
                const tail = p.split(".").pop()!.toLowerCase();
                if (aliases.has(tail)) {
                  chosen = p;
                  break;
                }
              }
              if (!chosen) {
                for (const p of params) {
                  const low = p.toLowerCase();
                  for (const a of aliases) {
                    if (
                      low.includes(a) ||
                      p.split(".").pop()!.toLowerCase().includes(a)
                    ) {
                      chosen = p;
                      break;
                    }
                  }
                  if (chosen) break;
                }
              }
              if (chosen) {
                matches.push(c);
                matchedParamByCommand[c] = chosen; // remember exact key
              }
            }
            try {
              progress("param-matches", "done", { matches });
            } catch {}
            if (matches.length === 0) {
              // Offer suggestions based on closest parameter keys (full and tail segments)
              const keys = Array.from(
                new Set(
                  allParams.concat(
                    allParams.map((p) => p.split(".").pop() || p)
                  )
                )
              );
              const ranked = rankClosest(param, keys).slice(0, 10);
              try {
                progress("param-suggestions", "done", { suggestions: ranked });
              } catch {}
              return {
                success: true,
                response: `Couldn't find any command in ${app} with a parameter matching "${param}". Closest parameters: ${ranked.join(
                  ", "
                )}`,
              };
            }
            if (matches.length === 1) {
              // 3) Single match: suggest payload -> override -> invoke
              const chosen: string = matches[0] as string;
              logger.info("🧩 Param-change resolved to single command", {
                command: chosen,
              });
              try {
                progress("param-chosen", "done", { command: chosen });
              } catch {}
              const paramKey = matchedParamByCommand[chosen] || param;
              return await suggestAndInvokeWithParam(
                app,
                workloadName,
                chosen,
                paramKey,
                valueRaw
              );
            }
            // 4) Multiple matches: ask user which command to use and stash context
            pendingParamOps[sessionId] = {
              app,
              workloadName,
              param,
              valueRaw,
              candidates: matches.slice(0, 10),
              matchedParamByCommand,
            };
            return {
              success: true,
              response: `Multiple commands in ${app} include parameter "${param}": ${matches.join(
                ", "
              )}. Which should I use?`,
            };
          }
        }

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
            "- list workload names for <app>",
            "- list all application types",
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

        // moved: generic app.command suggestion runs later, after explicit routes

        // AMPP schema and commands
        let m;
        if (
          (m = message.match(/get (?:me )?(?:the )?schemas for\s+([\w.-]+)/i))
        ) {
          logger.info("🧩 NL route -> ampp_list_commands_for_application", {
            app: m[1],
          });
          const app = m[1]!;
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
            command: normalizeCmd(m[2]!),
          });
          return await call("ampp_show_command_schema", {
            applicationType: m[1],
            command: normalizeCmd(m[2]!),
          });
        }
        // Parameters intent: list/get/what are parameters for <app>.<command> (support 'params' alias)
        if (
          (m = message.match(
            /(?:list|show|get|what (?:are|r) (?:the )?)\s*(?:parameters|params)\s+(?:for\s+)?([\w.-]+)\.([A-Za-z0-9_-]+)(?:@\d+(?:\.\d+)*)?/i
          ))
        ) {
          const app = m[1]!;
          const cmd = normalizeCmd(m[2]!);
          logger.info("🧩 NL route -> ampp_get_parameters", {
            app,
            command: cmd,
          });
          return await call("ampp_get_parameters", {
            applicationType: app,
            command: cmd,
          });
        }
        // Show just the required parameters for an app command
        if (
          (m = message.match(
            /show (?:me )?(?:the )?required parameters for\s+([\w.-]+)\.?([\w-]+)/i
          ))
        ) {
          const app = m[1]!;
          const cmd = m[2];
          logger.info("🧩 NL route -> ampp_get_required_parameters", {
            app,
            command: cmd,
          });
          return await call("ampp_get_required_parameters", {
            applicationType: app,
            command: cmd,
          });
        }
        if (
          (m = message.match(/suggest (?:a )?payload for\s+([\w.-]+)\.(\w+)/i))
        ) {
          logger.info("🧩 NL route -> ampp_suggest_payload", {
            app: m[1],
            command: normalizeCmd(m[2]!),
          });
          return await call("ampp_suggest_payload", {
            applicationType: m[1],
            command: normalizeCmd(m[2]!),
          });
        }
        // Flexible phrasing for listing commands
        if (
          (m = message.match(
            /(list|show)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?commands (?:for|in)\s+([\w.-]+)(?:\s+with\s+summaries?)?/i
          ))
        ) {
          logger.info("🧩 NL route -> ampp_list_commands_for_application", {
            app: m[2],
          });
          const includeSummary = /with\s+summaries?/i.test(message);
          return await call("ampp_list_commands_for_application", {
            applicationType: m[2],
            includeSummary,
          });
        }
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
        // List application types (aka application names)
        if (
          (m = message.match(/(?:list|show)\s+(?:all\s+)?application\s+(?:types|names)/i)) ||
          /^(?:what\s+are\s+)?the\s+applications\s*(?:\?|$)/i.test(message)
        ) {
          logger.info("🧩 NL route -> ampp_list_application_types");
          return await call("ampp_list_application_types", {});
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
        if (
          (m = message.match(
            /set clipplayer workload to\s+(?:"([^"]+)"|([^\s]+))/i
          ))
        ) {
          logger.info("🧩 NL route -> set_active_workload (ClipPlayer)", {
            workloadId: m[1] || m[2],
          });
          return await call("set_active_workload", {
            applicationType: "ClipPlayer",
            workloadId: m[1] || m[2],
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
            /set active workload for\s+([\w.-]+)\s+to\s+(?:"([^"]+)"|([^\s]+))/i
          ))
        ) {
          logger.info("🧩 NL route -> set_active_workload", {
            app: m[1],
            workloadId: m[2] || m[3],
          });
          return await call("set_active_workload", {
            applicationType: m[1],
            workloadId: m[2] || m[3],
          });
        }
        if ((m = message.match(/get active workload for\s+([\w.-]+)/i))) {
          logger.info("🧩 NL route -> get_active_workload", { app: m[1] });
          return await call("get_active_workload", { applicationType: m[1] });
        }
        // Invoke by workload name: dot form "invoke MiniMixer.controlstate on DanDMMaws {json}" or space form "invoke MiniMixer controlstate for DanDMMaws"
        // 1) Dot form
        if (
          (m = message.match(
            /(?:invoke|run|send(?:ing)?(?:\s+command)?)\s+([\w.-]+)\.(\w+)\s+(?:on|to|for)\s+(?:"([^"]+)"|(.+?))(?=\s*(?:payload\s*[:=]\s*)?\{|\s*$)/i
          ))
        ) {
          const app = m[1]!;
          const cmd = normalizeCmd(m[2]!);
          const workloadNameRaw = m[3] || m[4] || "";
          const workloadName = sanitizeWorkloadName(workloadNameRaw);
          const { obj, error } = extractJson(message);
          if (error) return { success: true, response: error };
          logger.info("🧩 NL route -> ampp_invoke_by_workload_name", {
            app,
            command: cmd,
            workloadName,
          });
          let res = await call("ampp_invoke_by_workload_name", {
            applicationType: app,
            workloadName,
            command: cmd,
            // If no JSON payload provided, omit it so server defaults to {}
            ...(obj ? { payload: obj } : {}),
          });
          let respText = String((res as any)?.response || "");
          if (/Command not found|app not cached/i.test(respText)) {
            // Retry once after refreshing schemas for reliability
            try {
              await call("ampp_refresh_application_schemas", {});
              res = await call("ampp_invoke_by_workload_name", {
                applicationType: app,
                workloadName,
                command: cmd,
                ...(obj ? { payload: obj } : {}),
              });
              respText = String((res as any)?.response || "");
            } catch {}
          }
          if (/Command not found|app not cached/i.test(respText)) {
            const cmds = await listCommands(app);
            if (cmds.length) {
              const ranked = rankClosest(cmd, cmds).slice(0, 10);
              return {
                success: true,
                response: `Unknown command "${cmd}" for ${app}. Try one of: ${ranked.join(
                  ", "
                )}`,
              };
            }
          }
          return res;
        }
        // 2) Space form
        if (
          (m = message.match(
            /(?:invoke|run|send(?:ing)?(?:\s+command)?)\s+([\w.-]+)\s+([A-Za-z0-9_-]+)\s+(?:on|to|for)\s+(?:"([^"]+)"|(.+?))(?=\s*(?:payload\s*[:=]\s*)?\{|\s*$)/i
          ))
        ) {
          const app: string = m[1]!;
          const cmd = normalizeCmd(m[2]!);
          const workloadNameRaw = m[3] || m[4] || "";
          const workloadName = sanitizeWorkloadName(workloadNameRaw);
          const { obj, error } = extractJson(message);
          if (error) return { success: true, response: error };
          logger.info(
            "🧩 NL route -> ampp_invoke_by_workload_name (space form)",
            {
              app,
              command: cmd,
              workloadName,
            }
          );
          let res = await call("ampp_invoke_by_workload_name", {
            applicationType: app,
            workloadName,
            command: cmd,
            ...(obj ? { payload: obj } : {}),
          });
          let respText = String((res as any)?.response || "");
          if (/Command not found|app not cached/i.test(respText)) {
            // Retry once after refreshing schemas for reliability
            try {
              await call("ampp_refresh_application_schemas", {});
              res = await call("ampp_invoke_by_workload_name", {
                applicationType: app,
                workloadName,
                command: cmd,
                ...(obj ? { payload: obj } : {}),
              });
              respText = String((res as any)?.response || "");
            } catch {}
          }
          if (/Command not found|app not cached/i.test(respText)) {
            const cmds = await listCommands(app);
            if (cmds.length) {
              const ranked = rankClosest(cmd, cmds).slice(0, 10);
              return {
                success: true,
                response: `Unknown command "${cmd}" for ${app}. Try one of: ${ranked.join(
                  ", "
                )}`,
              };
            }
          }
          return res;
        }
        if (
          (m = message.match(
            /invoke\s+([\w.-]+)\.(\w+)\s+(?:with )?({[\s\S]*})/i
          ))
        ) {
          const app: string = m[1]!;
          const cmd = normalizeCmd(m[2]!);
          const { obj, error } = extractJson(m[0]);
          if (error) return { success: true, response: error };
          logger.info("🧩 NL route -> ampp_invoke", { app, command: cmd });
          return await call("ampp_invoke", {
            applicationType: app,
            command: cmd,
            ...(obj ? { payload: obj } : {}),
          });
        }
        if (
          (m = message.match(
            /send control message .*?workload\s+(?:"([^"]+)"|(.+?))\s+app(?:lication)?\s+([\w.-]+).*?(?:schema|command)\s+(\w+)/i
          ))
        ) {
          const { obj } = extractJson(message);
          const workloadNameRaw2 = m[1] || m[2] || "";
          const workloadName = sanitizeWorkloadName(workloadNameRaw2);
          const app = m[3];
          const cmd = normalizeCmd(m[4]!);
          logger.info(
            "🧩 NL route -> ampp_invoke_by_workload_name (from NL 'send control message')",
            { workloadName, app, command: cmd }
          );
          return await call("ampp_invoke_by_workload_name", {
            workloadName,
            applicationType: app,
            command: cmd,
            payload: obj || {},
          });
        }
        if (
          (m = message.match(/get ampp state for\s+(?:"([^"]+)"|([^\s]+))/i))
        ) {
          logger.info(
            "ℹ️ NL route deprecated -> ampp_get_state (no longer available)",
            { workloadId: m[1] || m[2] }
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
          if (pending) {
            return { success: true, response: "Please provide a macro name." };
          }
          logger.info("🧩 NL route -> ampp_execute_macro_by_name", { name });
          return await call("ampp_execute_macro_by_name", { name });
        }
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
        // If user typed something like "app.command ..." but no explicit pattern matched above, suggest closest app/cmd
        {
          const ac = message.match(/([A-Za-z][\w.-]+)\.([A-Za-z0-9_-]+)/);
          if (ac && ac[1] && ac[2]) {
            const reqApp = String(ac[1]);
            const reqCmd = String(ac[2]);
            const apps = await listAppTypes();
            if (apps.length) {
              const foundApp = apps.find(
                (a) => a.toLowerCase() === reqApp.toLowerCase()
              );
              if (!foundApp) {
                const ranked = rankClosest(reqApp, apps).slice(0, 5);
                return {
                  success: true,
                  response: `Unknown application "${reqApp}". Did you mean: ${ranked.join(
                    ", "
                  )}?`,
                };
              }
              const cmds = await listCommands(foundApp);
              if (cmds.length) {
                const hasCmd = cmds.some(
                  (c) => c.toLowerCase() === reqCmd.toLowerCase()
                );
                if (!hasCmd) {
                  const ranked = rankClosest(reqCmd, cmds).slice(0, 10);
                  return {
                    success: true,
                    response: `Unknown command "${reqCmd}" for ${foundApp}. Try one of: ${ranked.join(
                      ", "
                    )}`,
                  };
                }
              }
            }
          }
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
        progress("ai-process", "start");
        const response = await aiService.processMessage(message);
        progress("ai-process", "done");
        logger.info("🤖 AI response generated successfully");
        return { success: true, response };
      } catch (error: any) {
        logger.error("❌ Error processing chat message:", error);
        opOk = false;
        return { success: false, error: error?.message || "Unknown error" };
      } finally {
        try {
          event.sender.send("chat:progress", {
            step: "complete",
            state: opOk ? "done" : "error",
            ts: Date.now(),
            opId,
          });
        } catch {}
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
              const reply = res.success ? res.response : `Error: ${res.error}`;
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
