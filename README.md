# 🧠 Chat Context System - Multi-Agent Environment

Hệ thống quản lý context chat tập trung cho môi trường multi-agent, hỗ trợ Claude Desktop, Cursor và các AI agents khác.

## 🏗️ Kiến trúc

```
┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐
│   Claude    │    │                 │    │                  │    │             │
│   Agent     │◄──►│  MCP Client     │◄──►│   Chat Context   │◄──►│   SQLite    │
└─────────────┘    │                 │    │     Server       │    │ Database    │
                   │                 │    │   (REST API)     │    │   + FTS5    │
┌─────────────┐    │                 │    │                  │    │             │
│   Cursor    │    │                 │    │                  │    └─────────────┘
│   Agent     │◄──►│                 │    └──────────────────┘
└─────────────┘    └─────────────────┘
```

## ✨ Tính năng chính

### 🔄 Chat Context Management
- **Lưu trữ tự động**: Tự động phân tích và lưu trữ nội dung chat
- **Tìm kiếm thông minh**: FTS5 full-text search với ranking
- **Phân loại tự động**: Tự động extract chủ đề, code snippets, quyết định

### 🤖 Multi-Agent Support
- **Claude Desktop**: Tích hợp hoàn chỉnh qua MCP
- **Cursor**: Sẵn sàng cho khi Cursor hỗ trợ MCP
- **Extensible**: Dễ dàng thêm agents mới

### 📊 Analytics & Insights
- **Thống kê sử dụng**: Phân tích patterns và trends
- **Project tracking**: Theo dõi progress theo dự án
- **Topic analysis**: Hiểu các chủ đề thường xuyên

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm hoặc yarn
- SQLite3
- Docker (tùy chọn)

### 1. Development Setup

```bash
# Clone repo
git clone <your-repo>
cd chat-context

# Setup server
cd server
npm install
npm run build
npm run dev

# Setup client (terminal khác)
cd ../client  
npm install
npm run build
```

### 2. Production với Docker

```bash
cd docker
docker-compose up -d
```

### 3. Cấu hình Claude Desktop

Thêm vào `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chat-context": {
      "command": "node",
      "args": ["./chat-context/client/dist/index.js"],
      "env": {
        "CONTEXT_SERVER_URL": "http://localhost:3001",
        "AGENT_ID": "claude-desktop-1",
        "AGENT_TYPE": "claude"
      }
    }
  }
}
```

## 📖 API Documentation

### Server Endpoints

#### Sessions Management
- `POST /api/sessions` - Tạo session mới
- `GET /api/sessions/:id` - Lấy session cụ thể
- `PUT /api/sessions/:id` - Update session
- `DELETE /api/sessions/:id` - Xóa session

#### Search & Query
- `GET /api/sessions/search` - Tìm kiếm sessions
- `GET /api/sessions/recent` - Sessions gần đây
- `POST /api/sessions/find-similar` - Tìm nội dung tương tự

#### Analytics
- `GET /api/analytics/stats` - Thống kê tổng quan
- `GET /api/analytics/usage` - Phân tích sử dụng

### MCP Tools

#### `save_chat_session`
Lưu session chat hiện tại với phân tích tự động.

```typescript
{
  chatContent: string;      // Required: Nội dung chat
  title?: string;          // Optional: Tiêu đề
  projectContext?: string; // Optional: Context dự án
  tags?: string[];         // Optional: Tags
}
```

#### `recall_similar_chat`
Tìm các cuộc hội thoại tương tự.

```typescript
{
  query: string;           // Required: Từ khóa tìm kiếm
  projectContext?: string; // Optional: Lọc theo project
  agentType?: string;      // Optional: Lọc theo agent
  limit?: number;          // Optional: Số kết quả
}
```

#### `get_project_history`
Lấy lịch sử chat của project.

```typescript
{
  projectContext: string;  // Required: Tên project
  limit?: number;          // Optional: Số sessions
  agentType?: string;      // Optional: Lọc theo agent
}
```

## 🛠️ Configuration

### Server Environment Variables

```bash
# Server settings
PORT=3001
HOST=localhost
NODE_ENV=development

# Database
DB_PATH=./data/chat-context.db

# Logging
LOG_LEVEL=info

# Security (production)
ALLOWED_ORIGINS=http://localhost:3000
```

### Client Environment Variables

```bash
# Server connection
CONTEXT_SERVER_URL=http://localhost:3001
REQUEST_TIMEOUT=30000

# Agent identification
AGENT_ID=claude-desktop-1
AGENT_TYPE=claude
```

## 🔧 Development

### Server Development

```bash
cd server

# Development với hot reload
npm run dev

# Build
npm run build

# Migration (nếu cần)
npm run migrate

# Tests
npm test
```

### Client Development

```bash
cd client

# Development
npm run dev

# Build
npm run build

# Test với Claude Desktop
# (cần config MCP trước)
```

### Database Schema

```sql
-- Main sessions table với FTS5 support
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_type TEXT CHECK (agent_type IN ('claude', 'cursor', 'other')),
  project_context TEXT,
  context_summary TEXT NOT NULL,
  key_topics TEXT NOT NULL, -- JSON array
  decisions_made TEXT NOT NULL, -- JSON array
  code_snippets TEXT NOT NULL, -- JSON array
  tags TEXT NOT NULL, -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- FTS5 virtual table for search
CREATE VIRTUAL TABLE chat_sessions_fts USING fts5(
  title, context_summary, key_topics, decisions_made, code_snippets, tags
);
```

## 📊 Monitoring & Analytics

### Health Check
```bash
curl http://localhost:3001/health
```

### Stats API
```bash
curl http://localhost:3001/api/analytics/stats
```

### Logs
- Server logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Docker logs: `docker-compose logs -f`

## 🚀 Deployment

### Docker Production

```bash
# Build và start
cd docker
docker-compose -f docker-compose.yml up -d

# Với nginx proxy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Monitoring
docker-compose logs -f chat-context-server
```

### Manual Production

```bash
# Server
cd server
npm ci --production
npm run build
NODE_ENV=production npm start

# Process manager (PM2 recommended)
pm2 start dist/index.js --name chat-context-server
pm2 startup
pm2 save
```

## 🔐 Security Considerations

### Rate Limiting
- Server: 100 requests/minute per IP
- Nginx: 10 requests/second with burst

### Data Protection
- Sanitization: HTML/script injection prevention
- Validation: Input validation cho tất cả endpoints
- CORS: Controlled origin access

### Production Setup
- Use HTTPS
- Set strong `ALLOWED_ORIGINS`
- Regular database backups
- Monitor logs for suspicious activity

## 🧪 Testing

### Unit Tests
```bash
# Server tests
cd server && npm test

# Client tests  
cd client && npm test
```

### Integration Tests
```bash
# Start server
npm run dev

# Test MCP connection
cd client && npm run test:integration
```

### Manual Testing
```bash
# Test server API
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"agentId":"test","agentType":"other","chatContent":"Test content"}'

# Test search
curl "http://localhost:3001/api/sessions/search?query=test"
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Submit Pull Request

### Code Style
- ESLint + Prettier configuration
- TypeScript strict mode
- Conventional commits

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Server không start được**
```bash
# Check port conflicts
lsof -i :3001

# Check logs
tail -f logs/error.log
```

**MCP Client không connect được**
```bash
# Verify server running
curl http://localhost:3001/health

# Check Claude Desktop logs
tail -f ~/.claude/logs/mcp.log
```

**Database errors**
```bash
# Check permissions
ls -la data/

# Reset database (⚠️ mất data)
rm data/chat-context.db
npm run migrate
```

**Performance issues**
```bash
# Check database size
du -h data/chat-context.db

# Analyze slow queries
sqlite3 data/chat-context.db ".timer on"
```

### Support
- Create issue on GitHub
- Check existing documentation
- Review logs for error details

---

🌟 **Enjoy using Chat Context System!** 

Hệ thống này giúp bạn có được context tốt hơn trong các cuộc hội thoại với AI agents, đặc biệt hữu ích cho development workflows và knowledge management. 