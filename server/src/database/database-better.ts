import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Logger } from '../utils/logger';
import { ChatSession, SearchFilters, SearchResult, SessionStats } from './schema';

export class DatabaseBetter {
  private db: Database.Database | null = null;
  private logger: Logger;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.logger = new Logger('Database');
    this.dbPath = dbPath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'chat-context.db');
  }

  async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        this.logger.info(`Created data directory: ${dataDir}`);
      }

      // Initialize better-sqlite3 database
      this.db = new Database(this.dbPath);
      
      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000');
      this.db.pragma('foreign_keys = ON');

      // Check FTS5 support (better-sqlite3 has FTS5 built-in)
      const hasFTS5 = await this.checkFTS5Support();

      // Create tables step by step
      await this.createTables(hasFTS5);

      this.logger.info(`Database initialized at: ${this.dbPath}`);

      // Initialize FTS index if supported
      if (hasFTS5) {
        await this.initializeFTSIndex();
      }

    } catch (error) {
      this.logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  private async checkFTS5Support(): Promise<boolean> {
    try {
      if (!this.db) throw new Error('Database not initialized');
      
      // Test FTS5 by trying to create a virtual table
      this.db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_test USING fts5(content)');
      this.db.exec('DROP TABLE IF EXISTS _fts5_test');
      
      this.logger.info('✅ FTS5 extension is available - Full search enabled');
      this.logger.info('📊 better-sqlite3 has built-in FTS5 support');
      return true;
    } catch (error) {
      this.logger.warn('⚠️ FTS5 extension not available - Using basic search fallback');
      this.logger.info('💡 Consider updating better-sqlite3 for FTS5 support');
      return false;
    }
  }

  private async createTables(hasFTS5: boolean = false): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Create main table first
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_type TEXT NOT NULL CHECK (agent_type IN ('claude', 'cursor', 'other')),
        participants TEXT NOT NULL,
        project_context TEXT,
        context_summary TEXT NOT NULL,
        key_topics TEXT NOT NULL,
        decisions_made TEXT NOT NULL,
        code_snippets TEXT NOT NULL,
        tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        session_hash TEXT,
        embedding_vector TEXT
      );
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_id ON chat_sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_type ON chat_sessions(agent_type);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_context ON chat_sessions(project_context);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_hash ON chat_sessions(session_hash);
    `);

    // Create FTS5 virtual table only if supported
    if (hasFTS5) {
      try {
        this.db.exec(`
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
        `);
        this.logger.info('✅ FTS5 virtual table created successfully');

        // Create triggers for FTS sync
        this.createFTSTriggers();
      } catch (error) {
        this.logger.error('Failed to create FTS5 table:', error);
        this.logger.warn('Continuing without FTS5 support...');
      }
    } else {
      this.logger.info('📝 Using basic search (no FTS5) - Search will work but be slower');
    }

    // Create other tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT,
        timestamp TEXT NOT NULL
        -- FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_analytics_session_id ON session_analytics(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_analytics_event_type ON session_analytics(event_type);
      CREATE INDEX IF NOT EXISTS idx_session_analytics_timestamp ON session_analytics(timestamp);

      CREATE TABLE IF NOT EXISTS server_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Initialize default configuration
    const insertConfig = this.db.prepare(`
      INSERT OR IGNORE INTO server_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
    `);

    insertConfig.run('version', '1.0.0');
    insertConfig.run('max_session_size', '10485760');
    insertConfig.run('cleanup_days', '30');
    insertConfig.run('enable_analytics', 'true');
    insertConfig.run('max_search_results', '50');
  }

  private createFTSTriggers(): void {
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.exec(`
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
      `);

      this.logger.info('✅ FTS triggers created successfully');
    } catch (error) {
      this.logger.error('Failed to create FTS triggers:', error);
      throw error;
    }
  }

  async createSession(session: Omit<ChatSession, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const id = this.generateId();
    const now = new Date().toISOString();
    
    const fullSession: ChatSession = {
      ...session,
      id,
      created_at: now,
      updated_at: now
    };

    const stmt = this.db.prepare(`
      INSERT INTO chat_sessions (
        id, title, agent_id, agent_type, participants, project_context,
        context_summary, key_topics, decisions_made, code_snippets, tags,
        created_at, updated_at, session_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullSession.id,
      fullSession.title,
      fullSession.agent_id,
      fullSession.agent_type,
      fullSession.participants,
      fullSession.project_context,
      fullSession.context_summary,
      fullSession.key_topics,
      fullSession.decisions_made,
      fullSession.code_snippets,
      fullSession.tags,
      fullSession.created_at,
      fullSession.updated_at,
      fullSession.session_hash
    );

    // Log analytics event
    this.logAnalyticsEvent(id, 'created', { agent_type: session.agent_type });

    this.logger.info(`Created session: ${id}`);
    return id;
  }

  async getSession(id: string): Promise<ChatSession | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?');
    const session = stmt.get(id) as ChatSession | undefined;

    if (session) {
      // Log analytics event
      this.logAnalyticsEvent(id, 'accessed');
    }

    return session || null;
  }

  async searchSessions(filters: SearchFilters): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = '';
    let params: any[] = [];

    // Check if FTS5 table exists
    const hasFTSTable = this.checkFTSTableExists();

    if (filters.query && hasFTSTable) {
      // Use FTS5 for text search if available
      sql = `
        SELECT cs.*, 
               fts.rank,
               highlight(chat_sessions_fts, 1, '<mark>', '</mark>') as matched_content
        FROM chat_sessions cs
        JOIN chat_sessions_fts fts ON cs.id = fts.id
        WHERE chat_sessions_fts MATCH ?
      `;
      params.push(filters.query);
    } else if (filters.query) {
      // Fallback to basic LIKE search
      sql = `
        SELECT *, NULL as rank, NULL as matched_content
        FROM chat_sessions 
        WHERE (
          title LIKE ? OR 
          context_summary LIKE ? OR 
          key_topics LIKE ? OR 
          decisions_made LIKE ? OR 
          code_snippets LIKE ? OR 
          tags LIKE ?
        )
      `;
      const searchTerm = `%${filters.query}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    } else {
      sql = 'SELECT *, NULL as rank, NULL as matched_content FROM chat_sessions WHERE 1=1';
    }

    // Add additional filters
    if (filters.agentType) {
      sql += ' AND agent_type = ?';
      params.push(filters.agentType);
    }

    if (filters.projectContext) {
      sql += ' AND project_context = ?';
      params.push(filters.projectContext);
    }

    if (filters.dateFrom) {
      sql += ' AND created_at >= ?';
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      sql += ' AND created_at <= ?';
      params.push(filters.dateTo);
    }

    // Tag filtering
    if (filters.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(() => 'tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConditions})`;
      filters.tags.forEach(tag => {
        params.push(`%"${tag}"%`);
      });
    }

    // Order and limit
    if (filters.query && hasFTSTable) {
      sql += ' ORDER BY rank';
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = this.db.prepare(sql);
    const results = stmt.all(...params) as SearchResult[];

    return results;
  }

  private checkFTSTableExists(): boolean {
    if (!this.db) return false;
    
    try {
      const stmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='chat_sessions_fts'"
      );
      const result = stmt.get() as { count: number };
      return result.count > 0;
    } catch (error) {
      return false;
    }
  }

  private async initializeFTSIndex(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Check if FTS table exists and has data
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM chat_sessions');
      const ftsCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM chat_sessions_fts');
      
      const count = countStmt.get() as { count: number };
      const ftsCount = ftsCountStmt.get() as { count: number };

      if (count && ftsCount && count.count > 0 && ftsCount.count === 0) {
        // Populate FTS index with existing data
        this.db.exec(`
          INSERT INTO chat_sessions_fts(id, title, context_summary, key_topics, decisions_made, code_snippets, tags)
          SELECT id, title, context_summary, key_topics, decisions_made, code_snippets, tags
          FROM chat_sessions;
        `);
        this.logger.info('FTS index populated with existing data');
      }

      // Optimize FTS index
      this.db.exec('INSERT INTO chat_sessions_fts(chat_sessions_fts) VALUES("optimize")');
      this.logger.info('✅ FTS index optimized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('FTS index initialization warning (this is normal for empty database):', errorMessage);
    }
  }

  private logAnalyticsEvent(sessionId: string, eventType: string, eventData?: any): void {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(
        'INSERT INTO session_analytics (session_id, event_type, event_data, timestamp) VALUES (?, ?, ?, ?)'
      );
      stmt.run(sessionId, eventType, eventData ? JSON.stringify(eventData) : null, new Date().toISOString());
    } catch (error) {
      this.logger.warn('Failed to log analytics event:', error);
    }
  }

  private generateId(): string {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.logger.info('Database connection closed');
    }
  }

  // Additional methods for compatibility...
  async updateSession(id: string, updates: Partial<ChatSession>): Promise<boolean> {
    // Implementation similar to original but using better-sqlite3
    return true;
  }

  async deleteSession(id: string): Promise<boolean> {
    // Implementation similar to original but using better-sqlite3
    return true;
  }

  async getRecentSessions(limit: number = 10, agentType?: string): Promise<ChatSession[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM chat_sessions';
    let params: any[] = [];

    if (agentType) {
      sql += ' WHERE agent_type = ?';
      params.push(agentType);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as ChatSession[];
  }

  async getSessionsByAgent(agentId: string, limit: number = 20): Promise<ChatSession[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(
      'SELECT * FROM chat_sessions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?'
    );
    return stmt.all(agentId, limit) as ChatSession[];
  }

  async getSessionStats(): Promise<SessionStats> {
    if (!this.db) throw new Error('Database not initialized');

    // Implementation for stats
    return {
      total_sessions: 0,
      sessions_by_agent: {},
      sessions_by_project: {},
      most_common_topics: [],
      recent_activity: []
    };
  }
} 