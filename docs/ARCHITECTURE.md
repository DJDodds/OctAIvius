# OctAIvius System Architecture

This document explains how the Electron app, React renderer, AI, Voice, and MCP pieces link together, with end‑to‑end event flows and data boundaries.

## Viewing these diagrams

If your Markdown viewer doesn’t render Mermaid blocks (```mermaid):

- In VS Code 1.95 or newer: enable Settings → “Markdown: Mermaid Enabled”.
- Or install the “Markdown Preview Mermaid Support” extension (bierner.markdown-mermaid).
- Make sure your workspace is trusted (VS Code will block scripts in untrusted workspaces).
- On GitHub, diagrams render in the web UI automatically.

## Big picture

```mermaid
flowchart LR
  U[User] --> R[Renderer (React)]
  R --> P[Preload bridge]
  P --> M[Main (Electron)]
  M --> AIS[AIService]
  M --> MCPS[MCPService]
  M --> VS[VoiceService]
  AIS --> AIP[Providers<br/>(OpenAI/Gemini/Anthropic)]
  MCPS --> CH[MCPChild<br/>(stdio transport)]
  CH --> Srv[Clip Player MCP<br/>(child process)]
  VS --> GCP[Google Speech-to-Text]
```

Key boundaries

- Renderer has no Node access; it talks to Main via the preload bridge (context isolation).
- Main owns OS/process operations, AI/MCP/Voice services, and IPC handlers.
- MCP servers run as separate child processes over JSON‑RPC (stdio) via MCPChild.

## Core components

- Renderer (React): chat UI, header (frameless controls), settings, MCP panel.
- Preload: exposes safe APIs (chat, ai, mcp, voice, conversation, app, windowCtrl).
- Main: creates BrowserWindow, handles IPC, auto‑connects MCP, and routes chat to AI or MCP.
- MCPService: spawns/monitors MCP child, initializes protocol, tools/list, tools/call, schema bootstrap.
- AIService: orchestrates providers using core modules (conversation, processors, init, tests, mock).
- VoiceService: receives audio buffers and calls Google STT (WEBM_OPUS).

## Sequence: NL query to AMPP tool

```mermaid
sequenceDiagram
  participant U as User
  participant R as Renderer (React)
  participant P as Preload
  participant M as Main (chat:send-message)
  participant X as MCPService
  participant C as MCPChild
  participant S as Clip Player MCP

  U->>R: Type "list all application types"
  R->>P: electronAPI.chat.sendMessage(text)
  P->>M: ipc invoke chat:send-message
  M->>X: ensureServer("clipplayer")
  alt not connected
    X->>C: start() + initialize
    C->>S: JSON-RPC initialize
    S-->>C: initialize result OK
  end
  M->>X: callFunction("clipplayer","ampp_list_application_types",{})
  X->>C: tools/call
  C->>S: JSON-RPC request
  S-->>C: result { content[0].text }
  C-->>X: result
  X-->>M: result
  M-->>P: { success:true, response:text }
  P-->>R: relay
  R-->>U: Assistant message rendered
```

Notes

- If intent is MCP‑related but no pattern matches, Main returns a short help list instead of falling back to AI.
- After initial connect, schemas are auto‑refreshed once and tools are warmed (tools/list) for faster UX.

## Sequence: Default AI response

```mermaid
sequenceDiagram
  participant U as User
  participant R as Renderer
  participant P as Preload
  participant M as Main
  participant A as AIService
  participant PV as Provider (e.g., Gemini)

  U->>R: Send general question
  R->>P: chat.sendMessage(text)
  P->>M: ipc invoke chat:send-message
  M->>A: processMessage(text)
  A->>PV: provider call (based on config)
  PV-->>A: completion text
  A-->>M: response string
  M-->>P: { success:true, response }
  P-->>R: relay
  R-->>U: Assistant message
```

## Sequence: Voice dictation to chat

```mermaid
sequenceDiagram
  participant U as User
  participant R as Renderer
  participant M as Main
  participant V as VoiceService
  participant G as Google STT

  U->>R: Press mic (push‑to‑talk)
  R->>R: MediaRecorder (WebM/Opus)
  R->>M: voice:process-audio(ArrayBuffer)
  M->>V: processAudio(buffer)
  V->>G: REST STT (WEBM_OPUS)
  G-->>V: transcript
  V-->>M: result
  M-->>R: { success:true, result }
  R->>R: Insert transcript as user message
  R->>M: chat:send-message(transcript)
```

## Sequence: App start → MCP connect → schema bootstrap

```mermaid
sequenceDiagram
  participant M as Main
  participant X as MCPService
  participant C as MCPChild
  participant S as Clip Player MCP
  participant R as Renderer

  M->>M: BrowserWindow ready-to-show
  M->>X: connectServer("clipplayer")
  X->>C: spawn node out/index.js
  C->>S: initialize via JSON-RPC
  S-->>C: OK
  C-->>X: connected
  X-->>M: connected
  M-->>R: mcp:servers-updated { connected }
  par warm
    M->>X: listTools("clipplayer")
    X->>C: tools/list
    C->>S: request
    S-->>C: tools array
  and bootstrap
    M->>X: bootstrapSchemas("clipplayer")
    X->>M: callFunction("ampp_refresh_application_schemas")
  end
  M-->>R: UI ready for tools
```

## IPC, contracts, and errors

IPC channels (preload ↔ main)

- chat:send-message(text) → { success, response? , error? }
- conversation:get-history → { success, history? }
- conversation:clear → { success }
- mcp:list-servers → { success, servers }
- mcp:connect-server(id) → { success }
- mcp:list-tools(id) → { success, tools }
- mcp:call-function(id,name,args) → { success, result }
- mcp:bootstrap-schemas(id) → { success }
- voice:process-audio(buf) → { success, result? , error? }
- window:close → { success }
- app:get-config → { success, config }

Common error modes

- MCP unavailable/slow: initialize or tools/list can time out; logs will show warnings and retries. Guidance fallback helps users rephrase.
- STT failures: surfaced as assistant error text; media capture errors are reported and tracks are cleaned up.
- Provider errors: AIService returns an error string; renderer displays a friendly message.

## Security and windowing

- Context isolation; only the preload bridge is exposed.
- CSP allows image data/blob for SVG icons; scripts/styles limited to self with minimal inline where required by framework.
- Frameless window; header area is draggable and controls are marked no‑drag; Close handled via IPC in main.

## Where things live

- Main and preload: `src/main.ts`, `src/preload.ts`
- Services
  - AI: `src/services/aiService.ts` + `src/services/ai/core/*`
  - Voice: `src/services/voiceService.ts`, `src/services/voice/sttGoogle.ts`
  - MCP: `src/services/mcpService.ts`, `src/services/mcp/{child.ts, types.ts, bootstrap.ts}`
- Renderer
  - Entry: `src/renderer/react/index.html`, `main.tsx`
  - UI: `src/renderer/react/components/*`

## Tips

- Natural‑language MCP is handled entirely in main’s chat handler—regex first, then MCP guidance fallback, and only then AI.
- Keep MCP servers compiled and clean on stdout. Use stderr for logs.
- The first successful MCP connection will automatically refresh schemas and warm the tool list.
