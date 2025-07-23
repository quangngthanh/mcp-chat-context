# 🔧 Chat Context System - Setup Guide

Chi tiết từng bước để thiết lập hệ thống Chat Context cho multi-agent environment.

## 📋 Prerequisites

### System Requirements
- **Node.js**: 18.0+ (LTS recommended)
- **npm**: 8.0+ hoặc **yarn**: 1.22+  
- **SQLite**: 3.35+ (thường có sẵn)
- **Git**: 2.30+
- **Docker**: 20.10+ (optional, cho production)

### Platform Support
- ✅ **Windows 10/11** (với WSL2 recommended)
- ✅ **macOS** 12+ 
- ✅ **Linux** (Ubuntu 20.04+, CentOS 8+)

## 🏗️ Installation Steps

### Step 1: Clone Repository

```bash
cd /path/to/your/projects
git clone <repository-url>
cd my-mcp/chat-context
```

### Step 2: Server Setup

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit environment variables (optional)
nano .env  # hoặc dùng editor khác

# Build TypeScript
npm run build

# Create data directory
mkdir -p data logs

# Test server
npm run dev
```

**Verify server is running:**
```bash
curl http://localhost:3001/health
# Should return: {"status":"healthy",...}
```

### Step 3: Client Setup

```bash
# Mở terminal mới, navigate to client directory
cd ../client

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit client configuration
nano .env
```

**Configure client `.env`:**
```bash
CONTEXT_SERVER_URL=http://localhost:3001
AGENT_ID=claude-desktop-1
AGENT_TYPE=claude
REQUEST_TIMEOUT=30000
LOG_LEVEL=info
```

```bash
# Build client
npm run build
```

### Step 4: Claude Desktop Configuration

**Locate Claude Desktop config file:**

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

**Add MCP server configuration:**
```json
{
  "mcpServers": {
    "chat-context": {
      "command": "node",
      "args": ["/absolute/path/to/chat-context/client/dist/index.js"],
      "env": {
        "CONTEXT_SERVER_URL": "http://localhost:3001",
        "AGENT_ID": "claude-desktop-1",
        "AGENT_TYPE": "claude",
        "REQUEST_TIMEOUT": "30000",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

⚠️ **Important**: Sử dụng absolute path cho args!

**Find absolute path:**
```bash
cd /path/to/your/chat-context/client
pwd
# Copy output và add /dist/index.js
```

### Step 5: Start Services

**Terminal 1 - Server:**
```bash
cd server
npm run dev
```

**Terminal 2 - Verify client:**
```bash
cd client
node dist/index.js
# Should connect to stdio và print "Chat Context MCP Client started"
```

### Step 6: Test Integration

1. **Restart Claude Desktop** (important!)
2. **Open new conversation** trong Claude Desktop
3. **Test MCP tools**:

```
Bạn có thể lưu cuộc hội thoại này không?
```

Claude sẽ có access to các MCP tools và có thể sử dụng `save_chat_session`.

## 🐳 Docker Setup (Recommended for Production)

### Quick Docker Start

```bash
cd docker
docker-compose up -d
```

### Custom Docker Setup

1. **Review configuration:**
```bash
# Edit docker-compose.yml if needed
nano docker-compose.yml
```

2. **Build và start:**
```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f chat-context-server
```

3. **Configure MCP client:**
```json
{
  "mcpServers": {
    "chat-context": {
      "command": "node",
      "args": ["/path/to/chat-context/client/dist/index.js"],
      "env": {
        "CONTEXT_SERVER_URL": "http://localhost:3001",
        "AGENT_ID": "claude-desktop-1",
        "AGENT_TYPE": "claude"
      }
    }
  }
}
```

## 🔧 Configuration Options

### Server Configuration

**Environment Variables (`server/.env`):**

```bash
# Basic settings
NODE_ENV=development          # development, production
PORT=3001                    # Server port
HOST=localhost               # Bind address

# Database
DB_PATH=./data/chat-context.db  # SQLite database path

# Logging
LOG_LEVEL=info               # error, warn, info, debug, verbose

# Security (production)
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Performance
MAX_SESSION_SIZE=10485760    # 10MB max session size
CLEANUP_DAYS=30              # Auto cleanup old sessions
MAX_SEARCH_RESULTS=50        # Max search results

# Rate limiting
RATE_LIMIT_POINTS=100        # Requests per duration
RATE_LIMIT_DURATION=60       # Duration in seconds
```

### Client Configuration

**Environment Variables (`client/.env`):**

```bash
# Server connection
CONTEXT_SERVER_URL=http://localhost:3001  # Server URL
REQUEST_TIMEOUT=30000                      # Request timeout (ms)

# Agent identification
AGENT_ID=claude-desktop-1                  # Unique agent ID
AGENT_TYPE=claude                          # claude, cursor, other

# Logging
LOG_LEVEL=info                             # Logging level
```

### Multiple Agents Setup

**For multiple Claude instances:**
```bash
# Agent 1
AGENT_ID=claude-desktop-main
AGENT_TYPE=claude

# Agent 2  
AGENT_ID=claude-desktop-work
AGENT_TYPE=claude
```

**For different agent types:**
```bash
# Claude
AGENT_ID=claude-desktop-1
AGENT_TYPE=claude

# Cursor (future)
AGENT_ID=cursor-instance-1
AGENT_TYPE=cursor

# Custom agent
AGENT_ID=my-custom-ai-agent
AGENT_TYPE=other
```

## 🧪 Testing Setup

### 1. Manual API Testing

```bash
# Test server health
curl http://localhost:3001/health

# Test session creation
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: test-agent" \
  -H "X-Agent-Type: other" \
  -d '{
    "agentId": "test-agent",
    "agentType": "other", 
    "chatContent": "This is a test chat session with some technical content about JavaScript and React development.",
    "projectContext": "test-project",
    "tags": ["test", "javascript", "react"]
  }'

# Test search
curl "http://localhost:3001/api/sessions/search?query=javascript&limit=5"

# Test recent sessions
curl "http://localhost:3001/api/sessions/recent?limit=10"
```

### 2. MCP Client Testing

**Test client connection:**
```bash
cd client
echo '{"method":"initialize","params":{"protocolVersion":"1.0.0","capabilities":{"tools":{}}}}' | node dist/index.js
```

### 3. Claude Desktop Integration Testing

1. **Check Claude Desktop logs:**
```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp.log

# Windows  
tail -f %LOCALAPPDATA%\Claude\logs\mcp.log

# Linux
tail -f ~/.local/share/claude/logs/mcp.log
```

2. **Test in Claude conversation:**
```
Test message: Can you save this conversation and then search for similar ones about JavaScript?
```

## 🚨 Troubleshooting

### Common Issues & Solutions

**❌ Server won't start - Port already in use**
```bash
# Find process using port 3001
lsof -i :3001  # macOS/Linux
netstat -ano | findstr :3001  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows

# Or use different port
echo "PORT=3002" >> server/.env
```

**❌ Database permission errors**
```bash
# Fix permissions
chmod 755 server/data
chmod 664 server/data/chat-context.db

# Or recreate database
rm server/data/chat-context.db
cd server && npm run dev  # Will recreate automatically
```

**❌ Claude Desktop doesn't see MCP server**
1. **Check config file location:**
```bash
# macOS
ls -la ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows
dir "%APPDATA%\Claude\claude_desktop_config.json"
```

2. **Validate JSON syntax:**
```bash
# Use online JSON validator or
python -m json.tool claude_desktop_config.json
```

3. **Check absolute paths:**
```bash
cd /path/to/chat-context/client
pwd  # Copy this exact path
ls dist/index.js  # Verify file exists
```

4. **Restart Claude Desktop completely**

**❌ MCP client connection errors**
```bash
# Test client independently
cd client
node dist/index.js

# Check server is running
curl http://localhost:3001/health

# Check environment variables
cat .env
```

**❌ Search not working**
```bash
# Check FTS5 support
cd server
sqlite3 data/chat-context.db "SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions_fts';"

# Should return: chat_sessions_fts
```

### Performance Issues

**Slow search queries:**
```bash
# Check database size
du -h server/data/chat-context.db

# Analyze queries
cd server
sqlite3 data/chat-context.db
.timer on
SELECT * FROM chat_sessions_fts WHERE chat_sessions_fts MATCH 'javascript';
```

**Memory usage:**
```bash
# Monitor server process
top -p $(pgrep -f "chat-context")

# Docker monitoring  
docker stats chat-context-server
```

### Logs & Debugging

**Server logs:**
```bash
# Development
tail -f server/logs/combined.log

# Docker
docker-compose logs -f chat-context-server

# Error logs only
tail -f server/logs/error.log
```

**Client debugging:**
```bash
# Enable debug logging
echo "LOG_LEVEL=debug" >> client/.env

# Test client with verbose output
cd client
LOG_LEVEL=debug node dist/index.js
```

## 🔄 Maintenance

### Regular Tasks

**1. Database cleanup (monthly):**
```bash
cd server
npm run cleanup  # Remove old sessions (configurable)
```

**2. Log rotation:**
```bash
# Manual log cleanup
find logs/ -name "*.log" -mtime +30 -delete

# Or setup logrotate (Linux)
sudo nano /etc/logrotate.d/chat-context
```

**3. Update dependencies:**
```bash
# Check outdated packages
npm outdated

# Update (be careful with major versions)
npm update
```

### Backup & Restore

**Backup:**
```bash
# Database backup
cp server/data/chat-context.db server/data/backup-$(date +%Y%m%d).db

# Full backup
tar -czf chat-context-backup-$(date +%Y%m%d).tar.gz server/data server/logs
```

**Restore:**
```bash
# Stop server first
# Copy backup file
cp backup-20241201.db server/data/chat-context.db
# Restart server
```

## 🚀 Production Deployment

### Pre-deployment Checklist

- [ ] Environment variables configured
- [ ] Database backed up
- [ ] SSL certificates ready (if using HTTPS)
- [ ] Firewall rules configured
- [ ] Monitoring setup
- [ ] Log rotation configured
- [ ] Process manager configured (PM2/systemd)

### Production Environment Variables

```bash
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DB_PATH=/app/data/chat-context.db
LOG_LEVEL=warn
ALLOWED_ORIGINS=https://yourdomain.com
RATE_LIMIT_POINTS=50
RATE_LIMIT_DURATION=60
```

---

🎉 **Setup Complete!** 

Your Chat Context System is now ready to enhance your multi-agent AI conversations with persistent context and intelligent search capabilities. 