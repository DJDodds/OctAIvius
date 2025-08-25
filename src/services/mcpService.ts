/**
 * Model Context Protocol (MCP) Service for Electron
 * Handles MCP server connections and function calls
 */

import { Logger } from "../utils/logger";
import { config } from "../config";
import { MCPServer } from "../types";
import { MCPChild } from "./mcp/child";
import type { MCPServerProcessConfig, MCPToolInfo } from "./mcp/types";
import { bootstrapSchemasOnce } from "./mcp/bootstrap";

export class MCPService {
  private logger: Logger;
  private connectedServers: Map<string, MCPServer> = new Map();
  private processMap: Map<string, MCPChild> = new Map();
  private serverConfigs: MCPServerProcessConfig[] = [];
  private bootstrapInFlight: Map<string, Promise<void>> = new Map();

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
      processServers.forEach((s) => merged.set(s.id, s));
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
      const attempts = Math.max(1, (config.mcp?.maxRetries ?? 0) + 1);
      let lastErr: any;
      for (let i = 0; i < attempts; i++) {
        try {
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
              maxRetries: attempts - 1,
              retryDelay:
                cfg.restartBackoffMs || config.mcp?.retryDelay || 1000,
            },
          });
          this.logger.info(
            `Spawned and connected MCP process server '${serverId}'`
          );
          // Always kick off schema bootstrap asynchronously on connect
          this.bootstrapSchemas(serverId).catch(() => {});
          return;
        } catch (e) {
          lastErr = e;
          const isLast = i === attempts - 1;
          this.logger.warn(
            `Connect attempt ${i + 1}/${attempts} failed for ${serverId}: ${
              (e as any)?.message || e
            }`
          );
          if (!isLast) {
            const backoff = Math.min(
              cfg.restartBackoffMs || config.mcp?.retryDelay || 1000,
              15000
            );
            await this.sleep(backoff);
          }
        }
      }
      throw lastErr;
    }

    // Fallback to mock server connection
    const servers = await this.listServers();
    const server = servers.find((s) => s.id === serverId);
    if (!server) throw new Error(`Server ${serverId} not found`);
    server.status = "connected";
    this.connectedServers.set(serverId, server);
    this.logger.info("Mock MCP server connected:", serverId);
  }

  private sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
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
    // Clear any in-flight bootstrap tracker
    this.bootstrapInFlight.delete(serverId);
  }

  /**
   * Call a function on an MCP server
   */
  async callFunction(
    serverId: string,
    functionName: string,
    args: any,
    options?: { timeoutMs?: number }
  ): Promise<any> {
    this.logger.info("Calling MCP function:", { serverId, functionName, args });
    // Routed to child process if available
    const child = this.processMap.get(serverId);
    if (child) {
      try {
        return await child.sendRequest(
          "tools/call",
          {
            name: functionName,
            arguments: args,
          },
          options?.timeoutMs
        );
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
    // Add a slow-operation logger to help diagnose UI "please wait" states
    const start = Date.now();
    let warned = false;
    const warnT = setTimeout(() => {
      warned = true;
      this.logger.warn(`[${serverId}] tools/list still pending after 5s...`);
    }, 5000);
    let res: any;
    try {
      res = await child.sendRequest("tools/list", {});
    } finally {
      clearTimeout(warnT);
      const dur = Date.now() - start;
      this.logger.info(
        `[${serverId}] tools/list completed in ${dur}ms${
          warned ? " (was slow)" : ""
        }`
      );
    }
    // Accept either { tools: [...] } or direct array
    const tools = Array.isArray(res) ? res : res?.tools;
    if (!Array.isArray(tools)) return [];
    return tools as MCPToolInfo[];
  }

  /** Explicitly refresh/bootstrap schemas for a server (dedupes in-flight). */
  async bootstrapSchemas(serverId: string): Promise<void> {
    if (!this.processMap.get(serverId)) {
      throw new Error(`Server ${serverId} is not connected`);
    }
    return bootstrapSchemasOnce(
      serverId,
      (sid, fn, args) => this.callFunction(sid, fn, args),
      this.bootstrapInFlight,
      this.logger
    );
  }
}
