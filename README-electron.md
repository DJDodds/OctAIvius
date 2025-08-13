# GVAIBot - AI Chatbot Electron Desktop Application

A comprehensive AI chatbot desktop application built with Electron, TypeScript, and modern web technologies, featuring voice dictation capabilities and Model Context Protocol (MCP) integration.

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

- **Main Process**: Handles window management, IPC, and system integration
- **Renderer Process**: Frontend interface with secure communication bridge
- **Preload Script**: Secure IPC bridge between main and renderer
- **Configuration Management**: Centralized config with environment validation
- **Services**: Modular services for AI, voice, and MCP integration

### Core Components

- **Main Process** (`src/main.ts`): Application lifecycle and window management
- **Preload Script** (`src/preload.ts`): Secure IPC communication bridge
- **Renderer** (`src/renderer/`): Frontend HTML, CSS, and JavaScript
- **Configuration** (`src/config/`): Environment validation and app settings
- **Utilities** (`src/utils/`): Logging and helper functions
- **Types** (`src/types/`): TypeScript type definitions

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
├── src/                          # Source code
│   ├── main.ts                   # Main Electron process
│   ├── preload.ts                # Secure IPC bridge
│   ├── config/                   # Configuration management
│   │   └── index.ts             # Environment validation and config
│   ├── types/                    # TypeScript type definitions
│   │   └── index.ts             # All application interfaces
│   ├── middleware/               # Express middleware (legacy)
│   │   └── index.ts             # Authentication, validation, security
│   ├── utils/                    # Utility functions
│   │   ├── logger.ts            # Winston logging configuration
│   │   └── index.ts             # General utility functions
│   ├── services/                 # Service modules (in development)
│   │   ├── aiService.ts         # AI provider integration
│   │   ├── voiceService.ts      # Voice processing
│   │   └── mcpService.ts        # MCP integration
│   └── renderer/                 # Frontend assets
│       ├── index.html           # Main HTML interface
│       ├── css/                 # Stylesheets
│       │   └── main.css        # Main CSS with theme support
│       └── js/                  # JavaScript modules
│           ├── config.js       # Client configuration
│           └── utils.js        # Client utilities
├── dist/                        # Compiled JavaScript (generated)
├── release/                     # Built Electron packages (generated)
├── assets/                      # Application assets (icons, etc.)
├── logs/                        # Application logs
├── uploads/                     # File uploads
├── temp/                        # Temporary files
├── quarantine/                  # Quarantined files
├── .env                         # Environment variables
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

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

The application includes Electron-specific configurations in `package.json`:

- **Main Entry**: `dist/main.js`
- **Build Configuration**: Electron Builder setup for packaging
- **Security**: Content Security Policy and context isolation
- **Platform Support**: Windows, macOS, and Linux builds

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

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Build and start the Electron application
- `npm run dev` - Start development mode with hot reload (planned)
- `npm run pack` - Package the app for the current platform
- `npm run dist` - Build distributable packages for all platforms
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

The application supports multiple AI providers:

- **Anthropic Claude**: Configure with `ANTHROPIC_API_KEY`
- **OpenAI GPT**: Configure with `OPENAI_API_KEY`
- **Mock Responses**: For testing without API keys

### Voice Processing

Planned integration with:

- **Web Speech API**: Client-side voice input (implemented)
- **Google Speech-to-Text**: Server-side speech recognition
- **Azure Speech Services**: Alternative speech processing

### Model Context Protocol (MCP)

The application is architected to support MCP servers:

- **MCP Client**: Ready for server connections
- **Function Calling**: Prepared for tool integration
- **Dynamic Capabilities**: Extensible AI functionality

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
npm run build && npm start
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
