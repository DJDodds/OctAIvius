# OctAIvius - AI Chatbot Electron Desktop Application

Note: Desktop-first. The supported renderer is the React app built via Vite at `src/renderer/react/index.html` (output to `dist/renderer`). Legacy non-React HTML/CSS/JS under `src/renderer/{index.html, css, js}` aren’t used by the app.

## Overview

This project implements a comprehensive AI chatbot desktop application with voice dictation capabilities, function calling, and Model Context Protocol (MCP) server integration. The application is built using Electron with TypeScript and provides secure IPC communication between main and renderer processes.

## Architecture

The application follows an Electron desktop architecture with the following key components:

### Core Components

- **Electron Main Process**: Window management, IPC handlers, and system integration
- **Electron Renderer Process**: Frontend interface with secure communication bridge
- **IPC Communication**: Secure inter-process communication for chat and services
- **Voice Processing**: Client-side Web Speech API + planned server-side STT
- **Function Calling**: Secure execution of system functions via IPC
- **MCP Integration**: Communication with Model Context Protocol servers
- **AI Integration**: Claude/OpenAI integration for conversational AI

### Project Structure (TypeScript + React/Vite)

```text
GVAIBot/
├── src/
│   ├── main.ts              # Electron main process (loads built React UI)
│   ├── preload.ts           # Secure IPC bridge (electronAPI exposure)
│   ├── config/              # Configuration management
│   ├── services/            # Core services (AI, Voice, MCP)
│   ├── utils/               # Utility functions and helpers
│   ├── types/               # Shared TypeScript types
│   └── renderer/
│       └── react/           # React frontend (Vite)
│           ├── components/  # UI components
│           ├── hooks/       # Custom React hooks (IPC, realtime)
│           ├── styles/      # Global styles (CSS)
│           ├── App.tsx      # Root application component
│           ├── main.tsx     # React entry
│           └── index.html   # Vite HTML template
├── dist/                    # Compiled main/preload + built React assets (dist/renderer)
├── assets/                  # Application assets (icons)
├── logs/                    # Application logs
├── vite.config.ts           # Vite build config for React
└── package.json
```

Legacy Express server code and static public assets are not used; Electron + React is the only active UI path.

## Features

### Desktop Application

- Native Electron app for Windows, macOS, and Linux
- Secure IPC communication between processes
- Context isolation and security best practices
- System integration and native menus

### Chat Interface

- Real-time messaging through IPC communication
- Message history and session management
- Mock AI responses (ready for real AI integration)
- Responsive desktop UI with theme support

### Voice

- Client mic capture in renderer; STT in main (Google or others when configured)
- Realtime (OpenAI) support for S2S when enabled
- VU meter and live transcript in the UI

### Function Calling

- Secure function execution system (planned)
- IPC-based function registry and validation
- Audit logging and monitoring
- Timeout and resource limits

### MCP Server Integration

- Process-backed AMPP ClipPlayer MCP server (stdio)
- Auto-connect on startup; schemas bootstrap and tools warm-up
- Natural-language routing in main for common AMPP/ClipPlayer intents

## Security Features

- Context isolation in Electron renderer processes
- Secure IPC communication bridge
- Content Security Policy enforcement
- No direct Node.js access from renderer
- Comprehensive input validation and audit logging

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Audio input device (for voice features)

### Installation

```bash
# Navigate to the project directory
cd GVAIBot

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Build the application (TS + React)
npm run build:all

# Start the Electron application
npm start
```

### Development

```bash
# Build and start the Electron app
npm start

# Build only (compile TypeScript)
npm run build

# Package for current platform
npm run pack

# Create distributable packages
npm run dist

# Clean build directory
npm run clean
```

## Configuration

The application uses environment variables for configuration. See the included `.env` file for current settings. The app supports:

- **AI Providers**: Anthropic Claude, OpenAI GPT (with API keys)
- **Environment Modes**: Development, production
- **Logging Levels**: Error, warn, info, debug
- **Theme Support**: Dark/light mode with persistence

## Current Status

### ✅ Working

- Electron app launches with React UI
- Chat interface over IPC; provider routing (OpenAI/Gemini/Anthropic)
- MCP auto-connect; tools list and NL routing
- Realtime voice loop (when configured): VU meter, transcript chip, TTS playback
- Secure IPC + context isolation; structured logging

### 🚧 In Progress

- More robust error toasts and transcript-as-user bubble
- Packaging polish and auto-updates

### 📋 Planned Features

- Auto-updater
- System tray integration
- Global hotkeys
- Enhanced voice processing

## Architecture Notes

Originally an Express + static HTML prototype, the project has been refactored into a focused Electron + React application. All HTTP server and legacy static asset layers were removed, reducing maintenance surface and eliminating duplicate UI paths.

## License

MIT License - see LICENSE file for details.
