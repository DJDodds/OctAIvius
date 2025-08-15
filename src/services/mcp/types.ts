import type { ChildProcessWithoutNullStreams } from "child_process";

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

export interface PendingRequest {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  method: string;
  timer?: NodeJS.Timeout;
}

export type MCPChildProcess = ChildProcessWithoutNullStreams;
