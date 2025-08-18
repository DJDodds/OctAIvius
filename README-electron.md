# GVAIBot - AI Chatbot Electron Desktop Application

A desktop-first AI chatbot built with Electron + TypeScript and a React/Vite renderer, featuring voice capabilities and Model Context Protocol (MCP) integration.

## 🌟 Key Features

- **Desktop Application**: Native Electron app for Windows, macOS, and Linux
- **AI Chat Interface**: Modern, responsive interface with dark/light theme support
- **Voice Dictation**: Web Speech API integration with planned server-side speech processing
- **Model Context Protocol**: Ready for MCP server integration for extended AI capabilities
- **Security**: Secure IPC communication between main and renderer processes
- **Real-time Communication**: Built-in IPC for live chat interactions
- **Logging**: Comprehensive Winston-based logging with request correlation
- **Configuration**: Environment-based configuration with validation
- **TypeScript**: Full type safety throughout the application

## 🏗️ Architecture

### Electron Structure

- **Main Process**: TypeScript entry at `src/main.ts`; window lifecycle, IPC, services
- **Renderer Process (React/Vite)**: TypeScript UI under `src/renderer/react` (built to `dist/renderer`)
- **Preload Script**: `src/preload.ts` secure bridge (context isolation)
- **Configuration Management**: `src/config/index.ts` (dotenv + validation)
- **Services**: Modular services for AI, Voice, MCP under `src/services`

### Core Components

- **Main Process** (`src/main.ts`): App lifecycle, window creation, IPC
- **Preload Script** (`src/preload.ts`): Secure IPC surface (no Node in renderer)
- **Renderer** (`src/renderer/react/`): React app (`main.tsx`, `App.tsx`, `index.html` template)
- **Configuration** (`src/config/`): Env validation and app settings
- **Utilities** (`src/utils/`): Logger and helpers
- **Types** (`src/types/`): Shared TypeScript types

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn package manager
- Git (for cloning)

### Installation

1. **Navigate to the project directory**:

   ```bash
   cd GVAIBot
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file in the root directory:

   ```bash
   # Basic configuration
   PORT=3000
   NODE_ENV=development
   HOST=localhost

   # Required secrets (generate secure values for production)
   JWT_SECRET=your_jwt_secret_at_least_32_characters_long
   SESSION_SECRET=your_session_secret_at_least_32_characters_long

   # AI Provider (optional for testing)
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=your_anthropic_api_key
   OPENAI_API_KEY=your_openai_api_key

   # Logging
   LOG_LEVEL=info

   # Rate limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100

   # CORS
   CORS_ORIGIN=http://localhost:3000
   ```

4. **Build the application**:

   ```bash
   npm run build
   ```

5. **Start the Electron application**:
   ```bash
   npm start
   ```

The application window will open automatically.

## 📁 Project Structure

```
GVAIBot/
├── src/
│   ├── main.ts                 # Electron main process (TS)
│   ├── preload.ts              # Secure IPC bridge (TS)
│   ├── config/
│   │   └── index.ts            # Env loading + validation
│   ├── services/               # AI, Voice, MCP services (TS)
│   ├── utils/                  # Logger + helpers (TS)
│   ├── types/                  # Shared TS types
│   └── renderer/
│       └── react/              # React + Vite app (TS)
│           ├── main.tsx        # React entry
│           ├── App.tsx         # Root component
│           ├── index.html      # Vite HTML template
│           ├── components/     # UI components
│           ├── hooks/          # Custom hooks (IPC, realtime)
│           └── styles/         # Global styles
├── dist/                       # Built main/preload + dist/renderer (Vite)
├── assets/                     # Icons and app assets
├── logs/                       # Runtime logs
├── .env                        # Environment variables
├── package.json                # Scripts and dependencies
├── tsconfig.json               # TypeScript config
└── README.md                   # Project docs
```

Notes

- The supported renderer is the React/Vite app under `src/renderer/react`.
- Legacy static files under `src/renderer/{index.html, css, js}` remain for reference but aren’t used by the app.

## 🔧 Configuration

### Environment Variables

| Variable            | Description          | Required | Default     |
| ------------------- | -------------------- | -------- | ----------- |
| `PORT`              | Server port (legacy) | No       | 3000        |
| `NODE_ENV`          | Environment mode     | No       | development |
| `HOST`              | Server host (legacy) | No       | localhost   |
| `JWT_SECRET`        | JWT signing secret   | Yes      | -           |
| `SESSION_SECRET`    | Session secret       | Yes      | -           |
| `AI_PROVIDER`       | AI service provider  | No       | anthropic   |
| `ANTHROPIC_API_KEY` | Anthropic API key    | No\*     | -           |
| `OPENAI_API_KEY`    | OpenAI API key       | No\*     | -           |
| `LOG_LEVEL`         | Logging level        | No       | info        |

\*API keys are optional for testing but required for AI functionality

### Electron-Specific Configuration

Electron runs the compiled JavaScript from TypeScript sources:

- **Main TypeScript Entry**: `src/main.ts` (compiles to `dist/main.js`)
- **Preload TypeScript Entry**: `src/preload.ts` (compiles to `dist/preload.js`)
- **Renderer Build**: React/Vite bundles to `dist/renderer`
- **Packaging**: Electron Builder config in `package.json`
- **Security**: CSP + contextIsolation enabled

## 🎯 Development Status

### ✅ Completed Features

1. **Core Electron Infrastructure**

   - Main process with window management
   - Secure IPC communication bridge
   - TypeScript compilation pipeline
   - Basic configuration management
   - Winston logging system

2. **Frontend Foundation**

   - Responsive HTML interface optimized for desktop
   - Dark/light theme system
   - Basic chat functionality with mock responses
   - Theme persistence and configuration display

3. **Security Implementation**
   - Context isolation enabled
   - Content Security Policy
   - Secure IPC communication
   - No remote module access

### 🚧 In Development

1. **Service Integration**

   - AI service providers (Anthropic, OpenAI)
   - Voice processing services
   - MCP client functionality
   - Function calling system

2. **Enhanced Features**
   - Real AI responses (currently mock)
   - Voice input processing
   - File drag-and-drop support
   - Advanced settings panel

### 📋 Planned Features

1. **Advanced Voice Processing**

   - Server-side speech recognition
   - Audio file format conversion
   - Voice activity detection
   - Multi-language support

2. **MCP Server Integration**

   - Dynamic server discovery
   - Tool registration system
   - Capability negotiation
   - Error handling and retry logic

3. **Desktop Integration**
   - System tray support
   - Global hotkeys
   - OS notifications
   - Auto-updater

## 🛠️ Development

### Available Scripts

- `npm run build` - Compile TypeScript (main/preload)
- `npm run build:react` - Build the React renderer with Vite
- `npm run build:all` - Build TS + React in one go
- `npm start` - Build all and launch Electron
- `npm run pack` - Package the app for the current platform
- `npm run dist` - Build distributables for all platforms
- `npm run clean` - Clean the dist directory

### Development Workflow

1. **Make changes** to TypeScript files in `src/`
2. **Build** the project with `npm run build`
3. **Test** changes by starting the app with `npm start`
4. **Debug** using Chrome DevTools (opens automatically in development)

### Adding New Features

1. **Main Process**: Add functionality in `src/main.ts`
2. **IPC Communication**: Extend preload script and add handlers
3. **Frontend**: Update HTML, CSS, and embedded JavaScript
4. **Configuration**: Add new config options in `src/config/index.ts`
5. **Services**: Implement new services in `src/services/`

## 🔌 Integration Points

### AI Providers

Multiple providers are supported:

- **OpenAI**: `OPENAI_API_KEY` (default when `AI_PROVIDER=openai`)
- **Gemini**: `GEMINI_API_KEY` (when `AI_PROVIDER=gemini`)
- **Anthropic**: `ANTHROPIC_API_KEY` (when `AI_PROVIDER=anthropic`)
- Mock responses are used when no provider is configured

### Voice Processing

Planned integration with:

- **Web Speech API**: Client-side voice input (implemented)
- **Google Speech-to-Text**: Server-side speech recognition
- **Azure Speech Services**: Alternative speech processing

### Model Context Protocol (MCP)

The app integrates an AMPP ClipPlayer MCP server and supports additional MCP servers via stdio:

- **MCP Client**: Process-backed stdio server with JSON-RPC
- **Auto-connect**: AMPP server registers and connects on startup
- **Tools**: Listed and callable from the MCP Panel and via NL routing

## 📊 Logging

The application uses Winston for comprehensive logging:

- **Console Output**: Development-friendly formatted logs
- **File Logging**: Structured JSON logs with rotation
- **Request Correlation**: Track operations across the application
- **Performance Monitoring**: Operation timing and metrics

Log files are stored in the `logs/` directory with automatic rotation.

## 🛡️ Security

### Electron Security Features

- **Context Isolation**: Renderer processes are isolated
- **Content Security Policy**: Prevents XSS attacks
- **No Node Integration**: Renderer cannot access Node.js directly
- **Secure IPC**: All communication goes through preload bridge
- **No Remote Module**: Remote module access disabled

### Best Practices Implemented

- **Secure Defaults**: All security features enabled by default
- **Input Validation**: All user inputs are validated
- **Error Handling**: Comprehensive error handling and logging
- **Updates**: Prepared for secure auto-updates

## 🧪 Testing

The application is designed for comprehensive testing:

- **Unit Tests**: Component-level testing (planned)
- **Integration Tests**: IPC communication testing (planned)
- **E2E Tests**: Full application workflow testing (planned)
- **Security Tests**: Vulnerability scanning (planned)

## 📦 Building and Distribution

### Development Build

```bash
npm run build:all && npm start
```

### Production Package

```bash
# Package for current platform
npm run pack

# Create distributable for all platforms
npm run dist
```

### Supported Platforms

- **Windows**: NSIS installer, portable executable
- **macOS**: DMG installer, Apple Silicon support
- **Linux**: AppImage, Debian package

## 🚀 Deployment

### Packaging for Distribution

The application uses Electron Builder for packaging:

1. **Configure** build settings in `package.json`
2. **Build** the application: `npm run dist`
3. **Distribute** the generated packages from `release/`

### Auto-Updates (Planned)

- **Update Server**: Electron updater integration
- **Automatic Checks**: Background update checking
- **Silent Updates**: Install updates on restart
- **Rollback**: Ability to rollback problematic updates

## 🆘 Troubleshooting

### Common Issues

1. **App won't start**: Check if Node.js and dependencies are installed
2. **Build errors**: Run `npm install` to ensure all dependencies are present
3. **White screen**: Check DevTools console for JavaScript errors
4. **Configuration errors**: Verify `.env` file exists and has required values

### Debug Mode

- **DevTools**: Automatically opens in development mode
- **Logging**: Set `LOG_LEVEL=debug` for verbose logging
- **Console**: Use `console.log()` in renderer process

### Performance

- **Memory Usage**: Monitor in Task Manager or Activity Monitor
- **CPU Usage**: Check for high CPU usage in DevTools
- **Startup Time**: Monitor application startup performance

## 🔄 Migration from Express

This application was successfully migrated from an Express.js web application to an Electron desktop application. Key changes include:

1. **Architecture**: From client-server to main-renderer processes
2. **Communication**: From HTTP/WebSocket to IPC
3. **Security**: From web security to Electron security model
4. **Deployment**: From web hosting to desktop distribution

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes with proper TypeScript types
4. **Test** the changes in both development and production builds
5. **Update** documentation as needed
6. **Submit** a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:

1. **Check** the application logs in the `logs/` directory
2. **Review** the DevTools console for frontend errors
3. **Verify** configuration in the `.env` file
4. **Update** dependencies with `npm install`

---

**GVAIBot Electron Edition** - Built with ❤️ using Electron, TypeScript, and modern desktop technologies.

## Recent Changes (Conversion to Electron)

### What Was Changed

1. **Main Process**: Created `src/main.ts` with Electron window management
2. **IPC Bridge**: Added `src/preload.ts` for secure communication
3. **Frontend**: Adapted existing HTML/CSS for desktop usage
4. **Configuration**: Updated `package.json` for Electron build system
5. **TypeScript**: Modified `tsconfig.json` for Electron types
6. **Security**: Implemented Electron security best practices

### What's Working

- ✅ Electron application launches successfully
- ✅ Main window displays with chat interface
- ✅ Basic IPC communication for chat messages
- ✅ Theme toggling and configuration display
- ✅ Mock AI responses for testing
- ✅ Logging system operational
- ✅ TypeScript compilation successful

### Next Steps

1. **Re-enable Services**: Fix TypeScript errors in service files
2. **AI Integration**: Connect real AI providers
3. **Voice Processing**: Implement voice input functionality
4. **MCP Integration**: Add Model Context Protocol support
5. **Testing**: Create comprehensive test suite
6. **Distribution**: Package for Windows, macOS, and Linux
