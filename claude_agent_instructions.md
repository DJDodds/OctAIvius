# Claude Agent Instructions for AI Chatbot with Express, Dictation & MCP Integration

## Project Setup
1. **Initialize the Express.js project structure**
   ```
   ai-chatbot/
   ├── src/
   │   ├── controllers/
   │   ├── middleware/
   │   ├── services/
   │   ├── routes/
   │   ├── mcp/
   │   ├── utils/
   │   └── config/
   ├── public/
   │   ├── css/
   │   ├── js/
   │   └── audio/
   ├── tests/
   ├── docs/
   └── package.json
   ```

2. **Install essential dependencies**
   - Express.js for web framework
   - Socket.io for real-time communication
   - Multer for file uploads (audio files)
   - @anthropic-ai/sdk or openai for AI integration
   - @modelcontextprotocol/sdk for MCP server communication
   - dotenv for environment variables
   - cors for cross-origin requests
   - helmet for security
   - winston for logging

## Core Chatbot Features
3. **Implement chat interface and API**
   - Create RESTful endpoints for chat messages
   - Set up WebSocket connections for real-time messaging
   - Implement message history and session management
   - Create responsive web UI with chat interface
   - Add typing indicators and message status

4. **Voice Dictation Integration**
   - Implement Web Speech API for client-side speech-to-text
   - Create audio upload endpoint for server-side processing
   - Integrate with speech recognition services (Google Speech-to-Text, Azure Speech, etc.)
   - Add voice activity detection and audio recording controls
   - Implement fallback mechanisms for different browsers
   - Create audio file handling and temporary storage

## Function Calling System
5. **API-based Function Execution**
   - Design function registry system for available actions
   - Create middleware for function call validation and authorization
   - Implement function call routing and execution
   - Add support for synchronous and asynchronous function calls
   - Create response formatting and error handling for function results
   - Implement function call logging and monitoring

6. **Integration with Overarching System**
   - Review existing ADO and Confluence documentation
   - Create service layer for system API calls
   - Implement authentication/authorization for system integration
   - Add configuration management for different environments
   - Create abstraction layer for system-specific function calls

## MCP Server Integration
7. **Model Context Protocol Implementation**
   - Set up MCP client to communicate with MCP servers
   - Implement server discovery and connection management
   - Create handlers for different MCP message types
   - Add support for tools, resources, and prompts from MCP servers
   - Implement connection pooling and failover mechanisms
   - Create MCP server health monitoring

8. **MCP Communication Layer**
   - Design message routing between chatbot and MCP servers
   - Implement request/response handling with proper error management
   - Add support for streaming responses from MCP servers
   - Create context management for multi-turn conversations
   - Implement caching layer for frequently used MCP resources

## Security & Authentication
9. **Security Implementation**
   - Add JWT-based authentication
   - Implement rate limiting for API endpoints
   - Add input validation and sanitization
   - Create CORS policies for cross-origin requests
   - Implement secure audio file handling
   - Add audit logging for function calls and system interactions

## Configuration & Environment
10. **Environment Setup**
    - Create configuration for different environments (dev, staging, prod)
    - Add environment variables for API keys and endpoints
    - Implement configuration validation
    - Create health check endpoints
    - Add graceful shutdown handling

## Key Technical Requirements
- **Backend**: Node.js with Express.js
- **Real-time Communication**: Socket.io or WebSockets
- **Speech Processing**: Web Speech API + server-side STT service
- **AI Integration**: Anthropic Claude or OpenAI GPT
- **MCP Protocol**: @modelcontextprotocol/sdk
- **Database**: Consider Redis for sessions, PostgreSQL for persistence
- **Security**: JWT, rate limiting, input validation
- **Monitoring**: Winston logging, health checks

## Critical Implementation Notes
1. **Speech-to-Text Pipeline**:
   - Implement client-side recording with MediaRecorder API
   - Add audio format conversion and compression
   - Create fallback for different audio codecs
   - Implement noise reduction and audio enhancement

2. **Function Call Architecture**:
   - Design function schema validation
   - Implement secure function execution sandbox
   - Add function call audit trail
   - Create timeout and resource limits

3. **MCP Server Management**:
   - Implement server registration and discovery
   - Add connection health monitoring
   - Create message queuing for reliability
   - Implement server failover strategies

## API Endpoints to Implement
- `POST /api/chat` - Send chat message
- `POST /api/audio` - Upload audio for transcription
- `GET /api/functions` - List available functions
- `POST /api/functions/execute` - Execute system function
- `GET /api/mcp/servers` - List connected MCP servers
- `POST /api/mcp/query` - Query MCP server
- `GET /api/health` - Health check endpoint

## Additional Instructions
- Refer to existing ADO and Confluence documentation for system integration patterns
- Implement comprehensive error handling with proper HTTP status codes
- Add extensive logging for debugging and monitoring
- Create unit and integration tests for all components
- Design for horizontal scaling and load balancing
- Implement graceful degradation when services are unavailable
- Add metrics collection for performance monitoring

## Documentation Requirements
1. API documentation with OpenAPI/Swagger
2. MCP server integration guide
3. Function calling documentation
4. Voice dictation setup guide
5. System architecture diagrams
6. Deployment and configuration guide