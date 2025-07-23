export interface ChatSession {
  id: string;
  title: string;
  agent_id: string;
  agent_type: 'claude' | 'cursor' | 'other';
  participants: string; // JSON array
  project_context?: string;
  context_summary: string;
  key_topics: string; // JSON array
  decisions_made: string; // JSON array
  code_snippets: string; // JSON array
  tags: string; // JSON array
  created_at: string;
  updated_at: string;
  session_hash?: string; // For deduplication
  embedding_vector?: string; // For semantic search
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
  similarity_score?: number;
  matched_content?: string;
}

export interface SessionStats {
  total_sessions: number;
  sessions_by_agent: Record<string, number>;
  sessions_by_project: Record<string, number>;
  most_common_topics: Array<{ topic: string; count: number }>;
  recent_activity: Array<{
    date: string;
    session_count: number;
  }>;
}

// Database initialization scripts
export const DATABASE_SCHEMA = `
-- Main sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('claude', 'cursor', 'other')),
  participants TEXT NOT NULL, -- JSON array
  project_context TEXT,
  context_summary TEXT NOT NULL,
  key_topics TEXT NOT NULL, -- JSON array
  decisions_made TEXT NOT NULL, -- JSON array
  code_snippets TEXT NOT NULL, -- JSON array
  tags TEXT NOT NULL, -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  session_hash TEXT, -- For deduplication
  embedding_vector TEXT -- For semantic search (stored as JSON)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_id ON chat_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_type ON chat_sessions(agent_type);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_context ON chat_sessions(project_context);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_hash ON chat_sessions(session_hash);

-- Full-Text Search virtual table (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS chat_sessions_fts USING fts5(
  id UNINDEXED,
  title,
  context_summary,
  key_topics,
  decisions_made,
  code_snippets,
  tags,
  content='chat_sessions',
  content_rowid='rowid'
);

-- Trigger to keep FTS table in sync with main table
CREATE TRIGGER IF NOT EXISTS chat_sessions_ai AFTER INSERT ON chat_sessions BEGIN
  INSERT INTO chat_sessions_fts(id, title, context_summary, key_topics, decisions_made, code_snippets, tags)
  VALUES (new.id, new.title, new.context_summary, new.key_topics, new.decisions_made, new.code_snippets, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS chat_sessions_ad AFTER DELETE ON chat_sessions BEGIN
  DELETE FROM chat_sessions_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS chat_sessions_au AFTER UPDATE ON chat_sessions BEGIN
  UPDATE chat_sessions_fts SET
    title = new.title,
    context_summary = new.context_summary,
    key_topics = new.key_topics,
    decisions_made = new.decisions_made,
    code_snippets = new.code_snippets,
    tags = new.tags
  WHERE id = new.id;
END;

-- Analytics table for tracking usage patterns
CREATE TABLE IF NOT EXISTS session_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'created', 'accessed', 'searched'
  event_data TEXT, -- JSON for additional data
  timestamp TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_analytics_session_id ON session_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_session_analytics_event_type ON session_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_session_analytics_timestamp ON session_analytics(timestamp);

-- Configuration table for server settings
CREATE TABLE IF NOT EXISTS server_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Initialize default configuration
INSERT OR IGNORE INTO server_config (key, value, updated_at) VALUES
  ('version', '1.0.0', datetime('now')),
  ('max_session_size', '10485760', datetime('now')), -- 10MB
  ('cleanup_days', '30', datetime('now')),
  ('enable_analytics', 'true', datetime('now')),
  ('max_search_results', '50', datetime('now'));
`; 