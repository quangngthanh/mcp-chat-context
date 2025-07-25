export interface ChatSession {
  id: string;
  title: string;
  agent_id: string;
  agent_type: 'claude' | 'cursor' | 'other';
  project_context?: string;
  original_content: string; // RAW CHAT CONTENT - QUAN TRỌNG NHẤT
  tags: string; // JSON array
  created_at: string;
  updated_at: string;
}

export interface SearchFilters {
  query?: string;
  agentType?: string;
  projectContext?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult extends ChatSession {
  rank?: number;
  matched_content?: string;
}

export interface SessionStats {
  total_sessions: number;
  sessions_by_agent: Record<string, number>;
  sessions_by_project: Record<string, number>;
  recent_activity: Array<{
    date: string;
    session_count: number;
  }>;
}

// Database initialization scripts - ĐƠN GIẢN HÓA
export const DATABASE_SCHEMA = `
-- Main sessions table - CHỈ GIỮ NHỮNG GÌ CẦN THIẾT
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('claude', 'cursor', 'other')),
  project_context TEXT,
  original_content TEXT NOT NULL, -- RAW CHAT CONTENT
  tags TEXT NOT NULL, -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_id ON chat_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_type ON chat_sessions(agent_type);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_context ON chat_sessions(project_context);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at);

-- Full-Text Search virtual table (FTS5) - CHỈ SEARCH ORIGINAL CONTENT
CREATE VIRTUAL TABLE IF NOT EXISTS chat_sessions_fts USING fts5(
  id UNINDEXED,
  title,
  original_content,
  tags,
  content='chat_sessions',
  content_rowid='rowid'
);

-- Trigger to keep FTS table in sync with main table
CREATE TRIGGER IF NOT EXISTS chat_sessions_ai AFTER INSERT ON chat_sessions BEGIN
  INSERT INTO chat_sessions_fts(id, title, original_content, tags)
  VALUES (new.id, new.title, new.original_content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS chat_sessions_ad AFTER DELETE ON chat_sessions BEGIN
  DELETE FROM chat_sessions_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS chat_sessions_au AFTER UPDATE ON chat_sessions BEGIN
  UPDATE chat_sessions_fts SET
    title = new.title,
    original_content = new.original_content,
    tags = new.tags
  WHERE id = new.id;
END;
`; 