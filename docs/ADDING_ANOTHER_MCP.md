# Adding Another MCP Server to GVAIBot

This guide explains how to integrate an additional MCP server (process-backed, stdio) into GVAIBot so it appears in the MCP panel and can be invoked similarly to the existing AMPP MCP Server.

## Prerequisites

- Your new MCP server is implemented with `@modelcontextprotocol/sdk` using `Server` + `StdioServerTransport`.
- It compiles to JavaScript (for example, `out/index.js`) and avoids writing non-protocol output to stdout (use stderr for logs).
- Any required environment variables are set (for example, via `.env` in the MCP repo or passed through `env` in the spawn config).

## 1) Build your MCP server

Ensure the server can run as a plain Node script for clean stdio:

- Entry point: `out/index.js` (recommended)
- Logging to stderr only (stdout reserved for JSON-RPC frames)

Example MCP server shape (pseudo):

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({ name: "my-mcp", version: "1.0.0" }, {
  capabilities: { tools: true },
} as any);
// ...register ListTools/CallTool handlers...

await server.connect(new StdioServerTransport());
console.error("My MCP server running on stdio");
```

## 2) Register the server in GVAIBot

In `src/main.ts`, register a process-backed MCP server with `MCPService.registerServerConfig`. Prefer spawning with Node on the compiled entry to avoid npm wrappers interfering with stdio.

Example (Windows paths shown):

```ts
// src/main.ts
(() => {
  const root = "C:/path/to/your-mcp-repo";
  const entry = `${root}/out/index.js`;
  mcpService.registerServerConfig({
    id: "myserver", // unique id
    name: "My Server", // display name
    command: "node", // spawn node directly
    args: [entry],
    cwd: root,
    initTimeoutMs: 60000, // allow time for any upstream connections
    autoRestart: true,
    restartBackoffMs: 3000,
    skipInitialize: false, // perform MCP initialize handshake
    // env: { ...process.env, MY_API_KEY: '...' }, // optional
  });
})();
```

Notes

- `id` must be unique. It’s used throughout the UI and IPC.
- If `out/index.js` isn’t present, build your MCP (for example, `npm run build`).
- Avoid using `npm run start` for stdio protocols unless necessary—npm can inject stdout noise.

## 3) (Optional) Auto-connect on startup

Still in `src/main.ts`, after the window is created, auto-connect and broadcast the state to update the UI immediately:

```ts
setTimeout(() => {
  mcpService
    .connectServer("myserver")
    .then(() => {
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send("mcp:servers-updated", {
          serverId: "myserver",
          status: "connected",
        });
      }
    })
    .catch(() => {
      /* optional: log warning */
    });
}, 500);
```

If you skip auto-connect, you can connect from the MCP panel (Connect button) and tools will be fetched automatically.

## 4) UI behavior (no code changes required)

- The MCP panel discovers registered servers via `listServers()` and shows them.
- On connection, it automatically fetches tools and renders them as quick chips.
- You can invoke tools from the panel or programmatically using IPC.

## 5) Chat commands (optional)

The current slash-commands (`/mcp`, `/clip`) route to the `clipplayer` server by default. You have two options:

1. Use the MCP panel for the new server (no change needed).
2. Extend the chat command parser in `src/main.ts` so you can target your server. A simple pattern is to allow `/mcp:<serverId> <tool> {args}` or add a new alias like `/<serverId> <tool> {args}`.

Example change concept:

```ts
// In chat:send-message handler
const m = cmd.match(
  /^\/(?:mcp:(?<sid>[a-z0-9_-]+)|(?<alias>myserver))\s+(?<tool>[\w:-]+)(?:\s+(?<json>[\s\S]+))?$/i
);
const serverId =
  m?.groups?.sid || (m?.groups?.alias ? "myserver" : "clipplayer");
// ...parse json, connect serverId, call tools/list or tools/call...
```

This keeps existing `/mcp ...` behavior intact while enabling `/mcp:myserver ...` or `/myserver ...`.

## 6) Dynamic registration via IPC (optional)

If you prefer not to hardcode in `main.ts`, you can register at runtime from the renderer using the exposed IPC:

```ts
await window.electronAPI.mcp.registerProcessServer({
  id: "myserver",
  name: "My Server",
  command: "node",
  args: ["C:/path/to/your-mcp-repo/out/index.js"],
  cwd: "C:/path/to/your-mcp-repo",
  initTimeoutMs: 60000,
  autoRestart: true,
});
```

Then connect it with `window.electronAPI.mcp.connectServer('myserver')` or via the MCP panel.

## 7) Testing and validation

1. Launch GVAIBot and open the MCP panel.
2. Confirm your new server appears.
3. Connect it (or auto-connect), then verify tools populate.
4. Invoke a simple tool: ensure `tools/call` returns a result.
5. Optionally extend chat commands to route to your server and test those.

## Troubleshooting

- Initialize timeouts

  - Ensure your server calls `server.connect(new StdioServerTransport())` and doesn’t block before that.
  - Increase `initTimeoutMs` if the server needs time to connect to upstream services.

- No tools listed

  - Verify `ListTools` handler returns `{ tools: [...] }`.
  - Check the app logs for `-> tools/list` and corresponding `<- response`.

- JSON-RPC framing issues

  - Only emit protocol frames on stdout; send all diagnostic logs to stderr.
  - The client is tolerant of CRLF/LF, but well-formed `Content-Length` frames are required.

- Windows path or spawn issues
  - Use absolute paths in `args` and `cwd`.
  - Prefer `'node'` + compiled entry over npm scripts for stdio cleanliness.

## References (GVAIBot)

- `src/services/mcpService.ts` — process spawn, initialize handshake, JSON-RPC framing, `tools/list`, `tools/call`.
- `src/main.ts` — server registration, auto-connect, renderer broadcast, chat command routing.
- `src/preload.ts` — safe IPC surface for MCP and `onServersUpdated`.
- `src/renderer/react/hooks/useMCP.ts` — renderer subscription and tool fetching.
- `src/renderer/react/components/MCPPanel.tsx` — UI for servers and tool invocation.

With these steps, you can add any number of MCP servers using the same stdio transport pattern and have them show up in the app with minimal wiring.
