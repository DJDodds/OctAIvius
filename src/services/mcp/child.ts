import { spawn } from "child_process";
import { config } from "../../config";
import { Logger } from "../../utils/logger";
import type { MCPServerProcessConfig, PendingRequest } from "./types";

export class MCPChild {
  private proc?: import("child_process").ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private restarting = false;
  private debugIO: boolean;
  constructor(private cfg: MCPServerProcessConfig, private logger: Logger) {
    const envFlag = String(process.env.MCP_DEBUG_IO || "").toLowerCase();
    this.debugIO =
      envFlag === "1" || envFlag === "true" || config.logging.level === "debug";
  }
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
      let readyHit = false;
      let readyResolver: (() => void) | undefined;
      const readyPromise: Promise<void> = new Promise((res) => {
        readyResolver = res;
      });
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
      const delayMs = this.cfg.postSpawnDelayMs ?? 1500;
      const delayPromise = new Promise<void>((res) => setTimeout(res, delayMs));
      const maxReadyWaitMs = delayMs + 15000;
      const timeoutReadyPromise = new Promise<void>((res) =>
        setTimeout(res, maxReadyWaitMs)
      );
      const waitFor = this.cfg.readyPattern
        ? Promise.race([readyPromise, timeoutReadyPromise])
        : delayPromise;

      if (this.cfg.skipInitialize) {
        setTimeout(() => resolve(), 300);
      } else {
        waitFor
          .catch(() => undefined)
          .finally(() => {
            const outerTimeout = setTimeout(
              () => reject(new Error("init timeout")),
              this.cfg.initTimeoutMs || 20000
            );
            const initParams = {
              protocolVersion: "2024-11-05",
              clientInfo: { name: "gvaibot", version: "1.0.0" },
              capabilities: {},
            } as any;
            let retried = false;
            const doInit = () =>
              this.sendRequest(
                "initialize",
                initParams,
                (this.cfg.initTimeoutMs || 20000) + 5000
              )
                .then(() => {
                  clearTimeout(outerTimeout);
                  resolve();
                })
                .catch((e) => {
                  if (!retried && readyHit) {
                    retried = true;
                    setTimeout(() => doInit(), 300);
                    return;
                  }
                  clearTimeout(outerTimeout);
                  reject(e);
                });
            doInit();
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
      const len = Buffer.byteLength(body);
      const frame = `Content-Type: application/json\r\nContent-Length: ${len}\r\n\r\n${body}\r\n`;
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
    try {
      const prev = this.buffer.length;
      const snippet = chunk
        .slice(0, 80)
        .toString("utf8")
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
      if (this.debugIO) {
        this.logger.warn(
          `[${this.cfg.id}] stdout chunk(${chunk.length}) buf=${prev}->${
            prev + chunk.length
          } head='${snippet}'`
        );
      } else {
        this.logger.debug(
          `[${this.cfg.id}] stdout chunk(${chunk.length}) buf=${prev}->${
            prev + chunk.length
          } head='${snippet}'`
        );
      }
    } catch {}
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > 1024 * 1024) {
      this.logger.warn(`[${this.cfg.id}] stdout buffer >1MB, trimming`);
      this.buffer = this.buffer.slice(-64 * 1024);
    }
    while (true) {
      let sep = this.buffer.indexOf("\r\n\r\n");
      let headerSepLen = 4;
      if (sep === -1) {
        const lfSep = this.buffer.indexOf("\n\n");
        if (lfSep !== -1) {
          sep = lfSep;
          headerSepLen = 2;
        }
      }
      if (sep === -1) {
        const parsed = this.tryParseRawJsonFromBuffer();
        if (!parsed) {
          const hasMarker = /content-length:\s*\d+/i.test(
            this.buffer.toString("utf8")
          );
          if (!hasMarker && this.buffer.length > 8192) {
            try {
              const preview = this.buffer.slice(0, 128).toString();
              const msg = `[${
                this.cfg.id
              }] stdout (no header yet) preview: ${preview
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n")
                .slice(0, 200)}`;
              if (this.debugIO) this.logger.warn(msg);
              else this.logger.debug(msg);
            } catch {}
            this.buffer = this.buffer.slice(-1024);
          }
          break;
        }
        for (const msg of parsed) {
          this.dispatch(msg);
        }
        continue;
      }
      const headerPart = this.buffer.slice(0, sep).toString();
      if (this.debugIO) {
        this.logger.warn(
          `[${this.cfg.id}] stdout header: ${headerPart
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")}`
        );
      } else {
        this.logger.debug(
          `[${this.cfg.id}] stdout header: ${headerPart
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")}`
        );
      }
      const match = /Content-Length:\s*(\d+)/i.exec(headerPart);
      if (!match) {
        const msg = `[${this.cfg.id}] ignoring non-protocol stdout before header`;
        if (this.debugIO) this.logger.warn(msg);
        else this.logger.debug(msg);
        this.buffer = this.buffer.slice(sep + headerSepLen);
        continue;
      }
      const len = parseInt(match[1]!, 10);
      const total = sep + headerSepLen + len;
      if (this.buffer.length < total) break;
      const jsonBuf = this.buffer.slice(sep + headerSepLen, total);
      this.buffer = this.buffer.slice(total);
      try {
        const msg = JSON.parse(jsonBuf.toString());
        this.dispatch(msg);
      } catch (e) {
        this.logger.error("JSON parse error");
      }
    }
  }
  private tryParseRawJsonFromBuffer(): any[] | null {
    if (this.buffer.length === 0) return null;
    const str = this.buffer.toString("utf8");
    let i = 0;
    while (i < str.length && /\s/.test(str[i]!)) i++;
    const start = i;
    const first = str[start];
    if (first !== "{" && first !== "[") return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = start; j < str.length; j++) {
      const ch = str[j]!;
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (ch === "\\") {
          esc = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
      if (depth === 0) {
        const end = j + 1;
        const jsonSlice = str.slice(start, end);
        try {
          const msg = JSON.parse(jsonSlice);
          this.buffer = Buffer.from(str.slice(end), "utf8");
          return [msg];
        } catch (e) {
          const msg = `[${this.cfg.id}] fallback JSON parse failed: ${
            (e as any)?.message || e
          }`;
          if (this.debugIO) this.logger.warn(msg);
          else this.logger.debug(msg);
          return null;
        }
      }
    }
    return null;
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
    try {
      const text = `[${this.cfg.id}] <- unsolicited message: ${JSON.stringify(
        msg
      )}`;
      if (this.debugIO) this.logger.warn(text);
      else this.logger.debug(text);
    } catch {}
  }
  private failAllPending(err: Error) {
    this.pending.forEach((p) => p.reject(err));
    this.pending.clear();
  }
}
