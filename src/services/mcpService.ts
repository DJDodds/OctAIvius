/**
 * Model Context Protocol (MCP) Service for Electron
 * Handles MCP server connections and function calls
 */

import { Logger } from "../utils/logger";
import { MCPServer } from "../types";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

export class MCPService {
  private logger: Logger;
  private connectedServers: Map<string, MCPServer> = new Map();
  private processMap: Map<string, MCPChild> = new Map();
  private serverConfigs: MCPServerProcessConfig[] = [];

  constructor() {
    this.logger = new Logger("MCPService");
    this.logger.info("🔌 MCP Service initialized");
  }

  /**
   * List available MCP servers
   */
  async listServers(): Promise<MCPServer[]> {
    this.logger.info("Listing available MCP servers...");
    try {
      // Base mock servers (could be replaced by configurable discovery later)
      const mockServers: MCPServer[] = [
        {
          id: "filesystem",
          name: "File System Server",
          url: "stdio://filesystem-server",
          status: this.connectedServers.has("filesystem")
            ? "connected"
            : "disconnected",
          capabilities: {
            tools: true,
            resources: true,
            prompts: false,
            sampling: false,
            logging: true,
          },
          errorCount: 0,
          metadata: {
            version: "1.0.0",
            description: "Provides file system operations (mock)",
            connectionTimeout: 30000,
            maxRetries: 3,
            retryDelay: 1000,
          },
        },
        {
          id: "web-search",
          name: "Web Search Server",
          url: "stdio://web-search-server",
          status: this.connectedServers.has("web-search")
            ? "connected"
            : "disconnected",
          capabilities: {
            tools: true,
            resources: false,
            prompts: true,
            sampling: false,
            logging: true,
          },
          errorCount: 0,
          metadata: {
            version: "1.0.0",
            description: "Provides web search capabilities (mock)",
            connectionTimeout: 30000,
            maxRetries: 3,
            retryDelay: 1000,
          },
        },
      ];

      // Convert registered process configs to MCPServer entries (if not already listed)
      const processServers: MCPServer[] = this.serverConfigs.map((cfg) => ({
        id: cfg.id,
        name: cfg.name,
        url: `stdio://${cfg.id}`,
        status: this.connectedServers.has(cfg.id)
          ? "connected"
          : "disconnected",
        capabilities: {
          tools: true,
          resources: false,
          prompts: false,
          sampling: false,
          logging: false,
        },
        errorCount: 0,
        metadata: {
          version: "unknown",
          description: "Spawned MCP child process (configured)",
          connectionTimeout: cfg.initTimeoutMs || 20000,
          maxRetries: 0,
          retryDelay: cfg.restartBackoffMs || 2000,
        },
      }));

      // Merge ensuring uniqueness by id (process configs override mocks if same id)
      const merged = new Map<string, MCPServer>();
      [...mockServers, ...processServers].forEach((s) => merged.set(s.id, s));
      return Array.from(merged.values());
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Error listing MCP servers:", new Error(errorMessage));
      throw error;
    }
  }

  /**
   * Connect to an MCP server
   */
  async connectServer(serverId: string): Promise<void> {
    this.logger.info("Connecting to MCP server:", serverId);
    // Already connected?
    if (this.connectedServers.has(serverId)) return;

    // Attempt process-based server if config exists
    const cfg = this.serverConfigs.find((c) => c.id === serverId);
    if (cfg) {
      if (this.processMap.has(serverId)) return; // process already running
      const child = new MCPChild(cfg, this.logger);
      await child.start();
      this.processMap.set(serverId, child);
      this.connectedServers.set(serverId, {
        id: cfg.id,
        name: cfg.name,
        url: `stdio://${cfg.id}`,
        status: "connected",
        capabilities: {
          tools: true,
          resources: false,
          prompts: false,
          sampling: false,
          logging: false,
        },
        errorCount: 0,
        metadata: {
          version: "unknown",
          description: "Spawned MCP child process",
          connectionTimeout: cfg.initTimeoutMs || 20000,
          maxRetries: 0,
          retryDelay: cfg.restartBackoffMs || 2000,
        },
      });
      this.logger.info(
        `Spawned and connected MCP process server '${serverId}'`
      );
      return;
    }

    // Fallback to mock server connection
    const servers = await this.listServers();
    const server = servers.find((s) => s.id === serverId);
    if (!server) throw new Error(`Server ${serverId} not found`);
    server.status = "connected";
    this.connectedServers.set(serverId, server);
    this.logger.info("Mock MCP server connected:", serverId);
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectServer(serverId: string): Promise<void> {
    this.logger.info("Disconnecting from MCP server:", serverId);
    const child = this.processMap.get(serverId);
    if (child) {
      child.stop();
      this.processMap.delete(serverId);
    }
    if (this.connectedServers.has(serverId)) {
      this.connectedServers.delete(serverId);
    }
  }

  /**
   * Call a function on an MCP server
   */
  async callFunction(
    serverId: string,
    functionName: string,
    args: any
  ): Promise<any> {
    this.logger.info("Calling MCP function:", { serverId, functionName, args });
    // Routed to child process if available
    const child = this.processMap.get(serverId);
    if (child) {
      try {
        return await child.sendRequest("tools/call", {
          name: functionName,
          arguments: args,
        });
      } catch (e) {
        this.logger.error(
          `Child MCP call failed (${serverId}:${functionName})`,
          e as any
        );
        throw e;
      }
    }

    // Mock fallback
    const server = this.connectedServers.get(serverId);
    if (!server) throw new Error(`Server ${serverId} is not connected`);
    if (!server.capabilities.tools)
      throw new Error(`Server ${serverId} does not support tool execution`);
    const mockResult = {
      success: true,
      result: `Mock result from ${functionName} on ${serverId} with args: ${JSON.stringify(
        args
      )}`,
      timestamp: new Date().toISOString(),
    };
    this.logger.info("Mock MCP function call completed", mockResult);
    return mockResult;
  }

  /**
   * Get available functions for a connected server
   */
  async getServerCapabilities(serverId: string): Promise<string[]> {
    const server = this.connectedServers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    // Convert capabilities object to string array
    const capabilityList: string[] = [];
    if (server.capabilities.tools) capabilityList.push("tools");
    if (server.capabilities.resources) capabilityList.push("resources");
    if (server.capabilities.prompts) capabilityList.push("prompts");
    if (server.capabilities.sampling) capabilityList.push("sampling");
    if (server.capabilities.logging) capabilityList.push("logging");

    return capabilityList;
  }

  /**
   * Get all connected servers
   */
  getConnectedServers(): MCPServer[] {
    return Array.from(this.connectedServers.values());
  }

  /**
   * Check if a server is connected
   */
  isServerConnected(serverId: string): boolean {
    return this.connectedServers.has(serverId);
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    this.logger.info("Cleaning up MCP connections...");
    for (const id of Array.from(this.connectedServers.keys())) {
      try {
        await this.disconnectServer(id);
      } catch {
        /* ignore */
      }
    }
    this.logger.info("MCP service cleanup completed");
  }

  /** Register a process-backed MCP server configuration */
  registerServerConfig(cfg: MCPServerProcessConfig) {
    if (this.serverConfigs.find((c) => c.id === cfg.id)) return; // avoid dup
    this.serverConfigs.push(cfg);
  }

  /** List tools exposed by a connected MCP server */
  async listTools(serverId: string): Promise<MCPToolInfo[]> {
    const child = this.processMap.get(serverId);
    if (!child) {
      throw new Error(`Server ${serverId} is not connected`);
    }
    const res = await child.sendRequest("tools/list", {});
    // Accept either { tools: [...] } or direct array
    const tools = Array.isArray(res) ? res : res?.tools;
    if (!Array.isArray(tools)) return [];
    return tools as MCPToolInfo[];
  }
}

export interface MCPServerProcessConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  autoRestart?: boolean;
  restartBackoffMs?: number;
  initTimeoutMs?: number;
  /** Some servers don't implement initialize; connect immediately after spawn. */
  skipInitialize?: boolean;
  /** Optional regex to detect when the server is ready from stderr output. */
  readyPattern?: RegExp;
  /** Optional delay after spawn before attempting initialize (ms). */
  postSpawnDelayMs?: number;
}

export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema?: any;
}

interface PendingRequest {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  method: string;
  timer?: NodeJS.Timeout;
}

class MCPChild {
  private proc?: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private restarting = false;
  constructor(private cfg: MCPServerProcessConfig, private logger: Logger) {}
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const nodeOverride = process.env.MCP_NODE_BIN;
      const command =
        this.cfg.command === "node" && nodeOverride
          ? nodeOverride
          : this.cfg.command;
      this.logger.info(
        `Spawning MCP server ${this.cfg.id}: '${command}' ${JSON.stringify(
          this.cfg.args || []
        )} (cwd=${this.cfg.cwd || process.cwd()})`
      );
      const useShell =
        process.platform === "win32" && /(^npm(\.cmd)?$|\.cmd$)/i.test(command);
      this.proc = spawn(command, this.cfg.args || [], {
        cwd: this.cfg.cwd,
        env: { ...process.env, ...this.cfg.env },
        shell: useShell,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.logger.info(
        `Spawned '${command}' with shell=${useShell ? "true" : "false"}`
      );
      this.proc.on("error", (err) => {
        this.logger.error(`Process error for ${this.cfg.id}: ${err.message}`);
      });
      this.proc.stdout.on("data", (d) => this.onData(d));
      // Monitor stderr: log and detect readiness if a pattern is provided
      const onStderr = (d: Buffer) => {
        const text = d.toString();
        this.logger.warn(`[${this.cfg.id}] stderr: ${text}`);
        if (this.cfg.readyPattern && this.cfg.readyPattern.test(text)) {
          readyHit = true;
          if (readyResolver) {
            readyResolver();
            readyResolver = undefined;
          }
        }
      };
      this.proc.stderr.on("data", onStderr);
      this.proc.once("exit", (code, signal) => {
        this.logger.warn(
          `MCP ${this.cfg.id} exited code=${code} signal=${signal}`
        );
        this.failAllPending(new Error("process exited"));
        // Optional automatic restart
        if (this.cfg.autoRestart && !this.restarting) {
          this.restarting = true;
          const backoff = Math.min(this.cfg.restartBackoffMs || 2000, 15000);
          setTimeout(() => {
            this.restarting = false;
            this.start().catch((e) =>
              this.logger.error(`Restart failed for ${this.cfg.id}`, e as any)
            );
          }, backoff);
        }
      });
      // Prepare a readiness wait: either pattern match or delay
      let readyHit = false;
      let readyResolver: (() => void) | undefined;
      const readyPromise: Promise<void> = new Promise((res) => {
        readyResolver = res;
      });
      const delayMs = this.cfg.postSpawnDelayMs ?? 1500;
      const delayPromise = new Promise<void>((res) => setTimeout(res, delayMs));

      if (this.cfg.skipInitialize) {
        // Assume server is ready shortly after spawn; give it a moment.
        setTimeout(() => resolve(), 300);
      } else {
        // Wait for ready: either pattern or a short delay (whichever occurs first after delay)
        Promise.race([readyPromise, delayPromise])
          .catch(() => undefined)
          .finally(() => {
            // basic initialize handshake (more spec-compliant)
            const timeout = setTimeout(
              () => reject(new Error("init timeout")),
              this.cfg.initTimeoutMs || 20000
            );
            const initParams = {
              protocolVersion: "2024-11-05",
              clientInfo: { name: "gvaibot", version: "1.0.0" },
              capabilities: {},
            } as any;
            this.sendRequest(
              "initialize",
              initParams,
              this.cfg.initTimeoutMs || 20000
            )
              .then(() => {
                clearTimeout(timeout);
                resolve();
              })
              .catch((e) => {
                clearTimeout(timeout);
                // Do not immediately kill; leave process for autoRestart if configured
                reject(e);
              });
          });
      }
    });
  }
  stop(): void {
    this.proc?.kill();
    this.failAllPending(new Error("stopped"));
  }
  sendRequest(method: string, params: any, timeoutMs?: number): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
      const entry: PendingRequest = { resolve, reject, method };
      if (timeoutMs && timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`request timeout: ${method}`));
        }, timeoutMs);
      }
      this.pending.set(id, entry);
      this.logger.info(`[${this.cfg.id}] -> ${method} (#${id})`);
      this.proc?.stdin.write(frame);
    });
  }
  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // Prevent unbounded growth due to noisy stdout
    if (this.buffer.length > 1024 * 1024) {
      this.logger.warn(`[${this.cfg.id}] stdout buffer >1MB, trimming`);
      this.buffer = this.buffer.slice(-64 * 1024);
    }
    while (true) {
      const sep = this.buffer.indexOf("\r\n\r\n");
      if (sep === -1) {
        // No complete header yet; if we don't even have 'Content-Length' marker, optionally trim leading noise
        const hasMarker = /content-length:\s*\d+/i.test(
          this.buffer.toString("utf8")
        );
        if (!hasMarker && this.buffer.length > 8192) {
          // drop older noise but keep a tail to allow header to appear
          this.buffer = this.buffer.slice(-1024);
        }
        break;
      }
      const headerPart = this.buffer.slice(0, sep).toString();
      const match = /Content-Length:\s*(\d+)/i.exec(headerPart);
      if (!match) {
        // Not a valid MCP header; discard this chunk and try to realign
        this.logger.warn(
          `[${this.cfg.id}] ignoring non-protocol stdout before header`
        );
        this.buffer = this.buffer.slice(sep + 4);
        continue;
      }
      const len = parseInt(match[1]!, 10);
      const total = sep + 4 + len;
      if (this.buffer.length < total) break;
      const jsonBuf = this.buffer.slice(sep + 4, total);
      this.buffer = this.buffer.slice(total);
      try {
        const msg = JSON.parse(jsonBuf.toString());
        this.dispatch(msg);
      } catch (e) {
        this.logger.error("JSON parse error");
      }
    }
  }
  private dispatch(msg: any) {
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (p.timer) clearTimeout(p.timer);
      this.logger.info(
        `[${this.cfg.id}] <- response #${msg.id} ${p.method} ${
          msg.error ? "ERROR" : "OK"
        }`
      );
      if (msg.error) {
        p.reject(msg.error);
      } else {
        p.resolve(msg.result);
      }
      return;
    }

    // notifications ignored for skeleton
  }
  private failAllPending(err: Error) {
    this.pending.forEach((p) => p.reject(err));
    this.pending.clear();
  }
}
