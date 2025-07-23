# 🚀 Start Chat Context Server

## Quick Start Commands

### 1. Build & Start (Development)

```bash
# Open terminal/command prompt
cd D:/Working/MCP/my-mcp/chat-context/server

# Build TypeScript
npm run build

# Delete old database (optional, recommended)
del data\chat-context.db*    # Windows
# rm -f data/chat-context.db*  # Linux/Mac

# Start server
npm run dev
```

### 2. Expected Output

Server should show:
```
✅ FTS5 extension is available - Full search enabled
OR
⚠️ FTS5 extension not available - Using basic search fallback
💡 To enable full-text search, install SQLite with FTS5 support

✅ Database initialized successfully  
🚀 Chat Context Server running on http://localhost:3001
```

### 3. Test Server

**Option A: Manual HTTP Test**
```bash
# Health check
curl http://localhost:3001/health

# Or open in browser: http://localhost:3001/health
```

**Option B: Use Test Script**
```bash
# Install axios if needed
npm install axios

# Run test script
node test-server.js
```

### 4. Common Issues & Solutions

**❌ Port 3001 already in use**
```bash
# Find process using port
netstat -ano | findstr :3001  # Windows  
lsof -i :3001                 # Linux/Mac

# Kill process or change port in .env
echo "PORT=3002" >> .env
```

**❌ Cannot find module errors**
```bash
# Install dependencies
npm install

# Rebuild
npm run build
```

**❌ Database permission errors**
```bash
# Delete and recreate database
del data\chat-context.db*     # Windows
rm -f data/chat-context.db*   # Linux/Mac

# Restart server
npm run dev
```

**❌ FTS5 warnings (non-critical)**
- Server will work with basic search
- To fix: Install SQLite with FTS5 support
- Or ignore - basic search works fine for development

## Production Start

```bash
# Build for production
npm run build

# Start production server
npm start

# Or with PM2
npm install -g pm2
pm2 start dist/index.js --name chat-context-server
```

## Success Indicators

✅ Server logs show "🚀 Chat Context Server running"  
✅ Health endpoint returns `{"status":"healthy"}`  
✅ No critical errors in logs  
✅ Test script passes all checks

---

**Next Step**: Configure Claude Desktop with MCP client! 