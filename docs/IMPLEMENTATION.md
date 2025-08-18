# OctAIvius Implementation Documentation

This document describes the current implementation of OctAIvius, a desktop-first Electron application with a React renderer. It integrates AI chat, voice dictation, and Model Context Protocol (MCP) tooling with natural‑language routing. Content assumes familiarity with TypeScript, Electron, and React.

## Architecture overview

- Electron main bootstraps services (AI, Voice, MCP) and manages a frameless BrowserWindow that loads the Vite-built React UI.
- A local AMPP MCP Server is registered and auto‑connected on startup; schema bootstrap and tools warm‑up occur automatically.
- Chat supports natural‑language MCP requests (no slash needed). A minimal slash suggestion UX exists when typing `/`, if suggestions are available.
- Voice MVP: push‑to‑talk in the renderer, STT in main, optional TTS playback for assistant replies.
- Strict security posture: context isolation, a preload bridge, and a CSP that permits data/blob images for SVG assets.

## Key paths

- Main process: `src/main.ts`, `src/preload.ts`
- Services: `src/services/{aiService.ts, voiceService.ts, mcpService.ts}`
  - AI core modules: `src/services/ai/core/{conversation.ts, connectivity.ts, processors.ts, init.ts, tests.ts, mock.ts}`
  - Voice STT helper: `src/services/voice/sttGoogle.ts`
  - MCP transport/types/bootstrap: `src/services/mcp/{child.ts, types.ts, bootstrap.ts}`
- Renderer (React): `src/renderer/react/**/*` (entry: `index.html` + `main.tsx`)
- Components: `src/renderer/react/components/*` (Header, MCPPanel, SettingsPanel, ChatContainer, MessageInput, etc.)

## MCP integration

- Main registers `clipplayer` from `C:/Users/.../gv-ampp-clipplayer-mcp/out/index.js` (compiled). If not present, it can fall back to an npm script, but compiled output is preferred for clean stdio.
- `MCPChild` (`src/services/mcp/child.ts`) spawns the child process, performs an `initialize` handshake with retries, and implements robust Content‑Length framing tolerant of CRLF/LF. Non‑protocol output is tolerated and trimmed.
- Auto‑connect on window ready; status is broadcast via `mcp:servers-updated`. After connect, schemas are refreshed once per server (deduped) via `bootstrapSchemasOnce`, and `tools/list` is warmed to prime the UI.
- Calling tools: `mcpService.callFunction(serverId, tool, args)` routes to the child via `tools/call`. Return normalization favors `result.content[0].text` when present.

### Natural‑language routing (main process)

In `chat:send-message` (main), common AMPP and ClipPlayer intents are recognized via regex and routed to MCP:

- AMPP discovery and schemas

  - “list all application types” → `ampp_list_application_types`
  - “get the schemas for <app>” → refresh + `ampp_list_commands_for_application`
  - “list the commands for <app>” → `ampp_list_commands_for_application`
  - “show the schema for <app>.<command>” → `ampp_show_command_schema`
  - “suggest a payload for <app>.<command>” → `ampp_suggest_payload`
  - “list workloads for <app>” / “list workloads” → `ampp_list_workloads` / `ampp_list_all_workloads`
  - “list clip players” → `ampp_list_workload_names` with `applicationType: ClipPlayer`
  - “list workload names for \<app\>” → `ampp_list_workload_names`
  - Active workload: set/get for a given app → `set_active_workload` / `get_active_workload`
  - Invoke control messages: use `ampp_invoke` (replaces `ampp_send_control_message`)
  - Get command docs: `ampp_get_command_doc`; Example prompts: `ampp_list_example_prompts`

- ClipPlayer controls

  - “play”, “pause”, “seek 100”, “set rate 2”, “shuttle -4”, “go to start/end”, “step forward/back”, “mark in/out”, “loop”, “get state”, “clear assets”, and composite transport commands map to their corresponding tools (`play_pause`, `seek`, `set_rate`, `shuttle`, `goto_start`, `goto_end`, `step_forward`, `step_back`, `mark_in`, `mark_out`, `loop`, `get_state`, `clear_assets`, `transport_command`, `transport_state`).

- Guidance fallback
  - If MCP intent is detected but no specific pattern matches, main returns a brief help list of supported commands instead of falling back to a generic AI answer.

## Renderer UX

- Header: frameless window with a draggable header, no‑drag controls, and an OctAIvius SVG icon. Connection/MCP loading status pills show current state; Close button uses `window:close` IPC.
- Chat: normal messages and voice transcriptions appear in the thread; a first‑run welcome message says “Hi, I’m OctAIvius…”. When MCP connects, a short “bootstrapping schemas…” notice is shown and later replaced with a confirmation after tools are loaded.
- Slash suggestions: when typing `/`, a small suggestions menu may appear. The list is generated on demand from the connected server’s tools. Keyboard: Up/Down, Tab/Enter to accept. Implementation triggers are inside `MessageInput.tsx` and lazily import a local suggestion module when present.

## AI service

- `aiService.ts` orchestrates providers and conversation, delegating to core modules:
  - Conversation history and helpers (`conversation.ts`)
  - Connectivity tests (`connectivity.ts` and `tests.ts`)
  - Provider initialization (`init.ts`)
  - Providers and processing (`processors.ts` with OpenAI/Gemini/Anthropic)
  - Optional mock responses (`mock.ts`)

## Voice

- Renderer records audio via MediaRecorder (WebM/Opus). Main processes audio buffers and calls Google STT (REST) when configured (`WEBM_OPUS`). Errors are surfaced to chat. Assistant replies can be spoken using Web Speech API when enabled.

## Security

- Context isolation with a minimal preload bridge (`preload.ts`). No Node.js APIs in the renderer.
- Content Security Policy: `img-src 'self' data: blob:` to allow SVGs and potential blob assets; scripts/styles restricted to self with inline allowances consistent with Electron’s renderer.

## Development

- Build all: `npm run build:all` (tsc + Vite)
- Start Electron: `npm run start`
- Dev renderer only: `npm run dev:react` (launch Electron for full flow)
- Type‑check: `npm run type-check`

## Usage guide

For concrete examples of tool calls and their natural‑language equivalents, see `docs/MCP_USAGE.md`.

## Adding another MCP server

1. Register a server via `mcpService.registerServerConfig({ id, name, command, args, cwd, env, initTimeoutMs, restartBackoffMs, autoRestart })` in `src/main.ts`.
2. Ensure the server prints only JSON‑RPC on stdout; use stderr for logs. Provide a `readyPattern` if available for faster initialize.
3. Auto‑connect on ready and broadcast `mcp:servers-updated` so the renderer can reflect status and warm the tool list.

## Troubleshooting

- Initialization/connection: Verify the MCP server is compiled and started with Node, and that stdout is clean. Look for `-> initialize` and `<- response initialize OK` in logs.
- Natural‑language routing: If queries look MCP‑related but don’t match a pattern, the app replies with a short guidance list; rephrase to one of the suggested forms.
- Tools list slow: logs will note when `tools/list` exceeds a few seconds. It still completes and will prime the UI.
- Voice STT: Confirm audio type is WebM/Opus and Google credentials are set.

## Notes

- Renderer entry is the React Vite app at `src/renderer/react/index.html` (output under `dist/renderer`). Legacy, non‑React HTML is deprecated and not used by the app.
- Branding: the header icon and welcome message use the OctAIvius name.
