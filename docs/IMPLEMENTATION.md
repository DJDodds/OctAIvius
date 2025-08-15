# AI Chatbot Implementation Documentation

## Update — 2025-08-12

This app was updated to fully wire up MCP connectivity, expose tools in the UI automatically, and let you invoke MCP tools directly from chat with suggestions.

Highlights

- Reliable MCP stdio transport and handshake

  - The Electron main process now spawns the compiled MCP server via Node for clean stdio: `gv-ampp-clipplayer-mcp/out/index.js`.
  - Implements proper MCP initialize with retries and robust framing (CRLF/LF tolerant) in `src/services/mcpService.ts`.
  - Auto-connect to the `clipplayer` server on app ready and broadcast status to renderer via `mcp:servers-updated` in `src/main.ts`.
  - Renderer subscribes and auto-fetches tools on “connected” in `src/renderer/react/hooks/useMCP.ts`.

- Chat slash-commands for MCP

  - You can run tools straight from chat using:
    - `/mcp tools` – list available tools
    - `/mcp <toolName> {jsonArgs}` – invoke a tool
    - `/clip <toolName> {jsonArgs}` – alias for `/mcp`
  - Implemented in the `chat:send-message` IPC handler in `src/main.ts`. It auto-connects the MCP server if needed and returns the result as the assistant message.

- Input suggestions (typeahead)
  - As you type `/`, the chat input suggests:
    - Base commands: `/mcp tools`, `/mcp <tool> {args}`, `/clip <tool> {args}`
    - Tool names from the connected server with a JSON args template derived from each tool’s schema.
  - Keyboard: Up/Down to navigate, Tab or Enter to accept. Enter still sends when suggestions are closed.
  - Implemented in `src/renderer/react/components/MessageInput.tsx`.

Quick usage

- See tools in UI: open the MCP panel (header button). The `Clip Player` server auto-connects and lists tools.
- Invoke from chat:
  - `/mcp tools`
  - `/mcp get_state`
  - `/mcp play_pause`
  - `/mcp set_rate {"rate":1}`
  - `/mcp transport_state {"state":"pause"}`

Where to look (key files)

- `src/main.ts`
  - Registers and auto-connects `clipplayer`
  - Broadcasts `mcp:servers-updated`
  - Adds slash-command routing inside `chat:send-message`
- `src/services/mcpService.ts`
  - Child process spawning (Node on compiled `out/index.js`)
  - Robust JSON-RPC framing + initialize loop
  - `tools/list` and `tools/call` wrappers
- `src/preload.ts` — exposes MCP IPC to renderer, plus `onServersUpdated`
- `src/renderer/react/hooks/useMCP.ts` — subscribes and auto-fetches tools
- `src/renderer/react/components/MessageInput.tsx` — chat typeahead suggestions

Config notes

- The MCP server path is auto-detected to `C:/Users/.../gv-ampp-clipplayer-mcp/out/index.js` and spawned with `node`. If the compiled output isn’t present, the fallback `npm run start` may be used (not recommended for stdio).
- Initialize timeout defaults to 60s for first boot (`initTimeoutMs`).

Troubleshooting

- No tools in UI: check app logs for `-> initialize` followed by `<- response initialize OK`. Verify `gv-ampp-clipplayer-mcp` has been built (tsc) and `.env` is correct.
- Chat command parse error: ensure JSON args are valid (e.g., `{ "rate": 1 }`). The chat will return a parse error if not.
- Too verbose logs: reduce logging level in `src/utils/logger.ts` via config.

## Overview

This document provides a comprehensive step-by-step guide for implementing the AI Chatbot with Express, Dictation & MCP Integration based on the provided instructions. The application has been built with a modular architecture, comprehensive error handling, and extensive documentation.

## Implementation Progress

### ✅ Completed Components

#### 1. Project Structure & Configuration

- **Package.json**: Complete dependencies and scripts for development and production
- **TypeScript Configuration**: Strict TypeScript setup with path aliases and proper type checking
- **Environment Configuration**: Comprehensive config management with validation using Joi
- **Documentation**: README.md with detailed setup and feature overview

## GVAIBot — Implementation (Desktop-first, Electron + React)

Last updated: 2025-08-13

This document describes the current implementation of GVAIBot as a desktop-first Electron app with a React renderer, integrated MCP tooling, slash-command chat UX, typeahead suggestions, and a voice MVP. Content assumes familiarity with TypeScript/Electron/React.

### High-level

- Electron main bootstraps services (AI, Voice, MCP) and manages a single BrowserWindow loading the Vite-built React app.
- A local MCP server (Clip Player) is registered and auto-connected at startup; tools are broadcast to the renderer.
- Chat supports `/mcp` slash-commands and dynamic typeahead for tools and JSON arg templates.
- Voice MVP: push-to-talk recording in renderer, STT request via main, TTS playback for assistant replies.
- Renderer bundle is code-split (lazy panels and dynamic suggestion engine) for faster initial load.

### Key paths

- Main process: `src/main.ts`, `src/preload.ts`
- Services: `src/services/{aiService.ts, voiceService.ts, mcpService.ts}`
- Renderer (React): `src/renderer/react/**/*` (entry: `index.html` + `main.tsx`)
- Legacy renderer globals (desktop context only): `src/renderer/js/{config.ts, utils.ts}`

### MCP integration

- Main registers `clipplayer` from `C:/Users/.../gv-ampp-clipplayer-mcp/out/index.js` (compiled). If not present, a fallback npm script can be used but stdio noise may affect framing.
- `mcpService` spawns the child process with clean stdio, performs `initialize` with retries, and implements robust Content-Length framing tolerant of CRLF/LF.
- On app ready, main auto-connects the server and emits `mcp:servers-updated`; renderer listens and fetches tools.
- Tools are available in a dedicated MCP panel and via chat commands.

Renderer UX details:

- Slash-commands: `/mcp tools`, `/mcp <tool> {json}`, and `/clip` alias.
- Suggestion engine (dynamically imported) fetches tools and derives JSON templates from tool input schemas.
- Panels (MCPPanel, SettingsPanel) are lazy-loaded to reduce initial JS.

### Voice MVP

- Renderer captures mic via MediaRecorder (WebM/Opus); barge-in cancels TTS when recording starts.
- Main `voiceService` accepts buffers, diagnoses container/size, and calls Google STT REST for `WEBM_OPUS` when configured. Errors surface to chat; no mock transcripts.
- Assistant replies can be spoken via Web Speech API (renderer) when voice is enabled.

### Desktop-first design

- UI scales for desktop resolutions; mobile-specific code/HTML has been removed. The app is intended for desktop Electron use.
- The only renderer entry is the Vite React app (`src/renderer/react/index.html`). Legacy pre-React HTML entry files were removed.

### Notable files

- `src/main.ts` — BrowserWindow lifecycle, IPC handlers, MCP server registration/auto-connect, slash-command router inside `chat:send-message`.
- `src/services/mcpService.ts` — child process spawn, handshake, Content-Length parser, `tools/list` and `tools/call` helpers.
- `src/services/voiceService.ts` — audio diagnostics, STT call with strict error behavior (no mock), `WEBM_OPUS` config.
- `src/renderer/react/components/MessageInput.tsx` — typeahead + mic record controls; surfaces STT errors to chat.
- `src/renderer/react/utils/suggestionEngine.ts` — dynamic import; tool suggestions and JSON templates.
- `src/renderer/react/App.tsx` — TTS for assistant replies when voice enabled; lazy-loaded panels.
- `src/renderer/js/config.ts` and `src/renderer/js/utils.ts` — globals (window.AppConfig, window.Utils) for any legacy desktop HTML/scripts; typed and compiled.

### Development

- Build all: `npm run build:all` (tsc + vite build)
- Start Electron: `npm run start`
- Dev renderer (optional): `npm run dev:react` (serves React; still launch Electron for full flow)
- Type-check: `npm run type-check`

### Adding another MCP server (summary)

1. Register a server in `src/main.ts` via `mcpService.registerServerConfig({ id, name, command, args, cwd })`.
2. Ensure the server writes only JSON-RPC to stdout and logs to stderr.
3. Optionally auto-connect on app ready and broadcast `mcp:servers-updated`.
4. Renderer will list it in the MCP panel; slash-commands will route to it if you add parsing rules.

### Troubleshooting

- Initialization stuck: ensure the MCP server is compiled and started with Node; confirm no stdout noise. Look for initialize request/response in logs.
- Slash-command JSON errors: confirm valid JSON after the tool name (e.g., `{ "rate": 1 }`).
- STT errors: check voice logs; verify audio container (webm/opus) and Google credentials.

### Recent changes (2025-08-13)

- Ported legacy `src/renderer/js/{config.js, utils.js}` to TypeScript with global window assignments; type-checked.
- Split renderer bundles (React.lazy and dynamic import) to reduce initial load size.
- Hardened voice path (no mock transcripts; surfacing explicit errors to chat).
- Confirmed desktop-first: removed obsolete pre-React HTML entry points.
