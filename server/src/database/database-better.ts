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

      // Check FTS5 support
      const hasFTS5 = await this.checkFTS5Support();

      // Create tables
      await this.createTables(hasFTS5);

      this.logger.info(`✅ Database initialized: ${this.dbPath}`);

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
      
      this.db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_test USING fts5(content)');
      this.db.exec('DROP TABLE IF EXISTS _fts5_test');
      
      this.logger.info('✅ FTS5 extension available');
      return true;
    } catch (error) {
      this.logger.warn('⚠️ FTS5 not available - using basic search');
      return false;
    }
  }

  private async createTables(hasFTS5: boolean = false): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Create main table - SIMPLIFIED
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_type TEXT NOT NULL CHECK (agent_type IN ('claude', 'cursor', 'other')),
        project_context TEXT,
        original_content TEXT NOT NULL,
        tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_id ON chat_sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_type ON chat_sessions(agent_type);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_context ON chat_sessions(project_context);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at);
    `);

    // Create FTS5 virtual table if supported
    if (hasFTS5) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS chat_sessions_fts USING fts5(
            id UNINDEXED,
            title,
            original_content,
            tags,
            content='chat_sessions',
            content_rowid='rowid'
          );
        `);
        this.logger.info('✅ FTS5 virtual table created');

        // Create triggers for FTS sync
        this.createFTSTriggers();
      } catch (error) {
        this.logger.error('Failed to create FTS5 table:', error);
        this.logger.warn('Continuing without FTS5...');
      }
    }
  }

  private createFTSTriggers(): void {
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.exec(`
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
      `);

      this.logger.info('✅ FTS triggers created');
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
        id, title, agent_id, agent_type, project_context,
        original_content, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullSession.id,
      fullSession.title,
      fullSession.agent_id,
      fullSession.agent_type,
      fullSession.project_context,
      fullSession.original_content,
      fullSession.tags,
      fullSession.created_at,
      fullSession.updated_at
    );

    this.logger.info(`✅ Created session: ${id}`);
    return id;
  }

  async getSession(id: string): Promise<ChatSession | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?');
    const session = stmt.get(id) as ChatSession | undefined;

    return session || null;
  }

  async searchSessions(filters: SearchFilters): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = '';
    let params: any[] = [];

    // Check if FTS5 table exists
    const hasFTSTable = this.checkFTSTableExists();

    if (filters.query && hasFTSTable) {
      // Use FTS5 for text search
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
          original_content LIKE ? OR 
          tags LIKE ?
        )
      `;
      const searchTerm = `%${filters.query}%`;
      params.push(searchTerm, searchTerm, searchTerm);
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
          INSERT INTO chat_sessions_fts(id, title, original_content, tags)
          SELECT id, title, original_content, tags
          FROM chat_sessions;
        `);
        this.logger.info('FTS index populated with existing data');
      }

      // Optimize FTS index
      this.db.exec('INSERT INTO chat_sessions_fts(chat_sessions_fts) VALUES("optimize")');
      this.logger.info('✅ FTS index optimized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('FTS index warning (normal for empty database):', errorMessage);
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

  // SIMPLIFIED METHODS
  async updateSession(id: string, updates: Partial<ChatSession>): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const fields = [];
    const values = [];

    if (updates.title) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.original_content) {
      fields.push('original_content = ?');
      values.push(updates.original_content);
    }
    if (updates.tags) {
      fields.push('tags = ?');
      values.push(updates.tags);
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const sql = `UPDATE chat_sessions SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...values);

    return result.changes > 0;
  }

  async deleteSession(id: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }

  // XÓA NHIỀU SESSIONS CÙNG LÚC
  async deleteSessions(ids: string[]): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`DELETE FROM chat_sessions WHERE id IN (${placeholders})`);
    const result = stmt.run(...ids);

    this.logger.info(`✅ Deleted ${result.changes} sessions`);
    return result.changes;
  }

  // XÓA TẤT CẢ SESSIONS
  async deleteAllSessions(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM chat_sessions');
    const result = stmt.run();

    this.logger.info(`✅ Deleted ALL sessions: ${result.changes} sessions removed`);
    return result.changes;
  }

  // XÓA SESSIONS CŨ HƠN X NGÀY
  async deleteOldSessions(daysOld: number = 30): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffISO = cutoffDate.toISOString();

    const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE created_at < ?');
    const result = stmt.run(cutoffISO);

    this.logger.info(`✅ Deleted ${result.changes} sessions older than ${daysOld} days`);
    return result.changes;
  }

  // XÓA SESSIONS THEO AGENT
  async deleteSessionsByAgent(agentId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE agent_id = ?');
    const result = stmt.run(agentId);

    this.logger.info(`✅ Deleted ${result.changes} sessions for agent: ${agentId}`);
    return result.changes;
  }

  // XÓA SESSIONS THEO PROJECT
  async deleteSessionsByProject(projectContext: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE project_context = ?');
    const result = stmt.run(projectContext);

    this.logger.info(`✅ Deleted ${result.changes} sessions for project: ${projectContext}`);
    return result.changes;
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

  async findSimilarSessions(content: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Extract key terms for similarity matching
    const keyTerms = this.extractKeyTermsFromContent(content);
    
    if (keyTerms.length === 0) {
      return [];
    }

    // Check if FTS5 table exists
    const hasFTSTable = this.checkFTSTableExists();

    let sql = '';
    let params: any[] = [];

    if (hasFTSTable) {
      // Use FTS5 for better similarity search
      const searchQuery = keyTerms.join(' OR ');
      sql = `
        SELECT cs.*, 
               fts.rank,
               highlight(chat_sessions_fts, 1, '<mark>', '</mark>') as matched_content
        FROM chat_sessions cs
        JOIN chat_sessions_fts fts ON cs.id = fts.id
        WHERE chat_sessions_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [searchQuery, limit];
    } else {
      // Fallback to basic LIKE search with multiple terms
      const likeConditions = keyTerms.map(() => 
        '(title LIKE ? OR original_content LIKE ? OR tags LIKE ?)'
      ).join(' OR ');
      
      sql = `
        SELECT *, NULL as rank, NULL as matched_content
        FROM chat_sessions 
        WHERE ${likeConditions}
        ORDER BY created_at DESC
        LIMIT ?
      `;
      
      // Add parameters for each term (3 fields per term)
      keyTerms.forEach(term => {
        const searchTerm = `%${term}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      });
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    const results = stmt.all(...params) as SearchResult[];

    return results;
  }

  private extractKeyTermsFromContent(content: string): string[] {
    // Simple key term extraction
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['the', 'and', 'that', 'this', 'with', 'from', 'they', 'have', 'been', 'said', 'each', 'which', 'their', 'will', 'about', 'would', 'there', 'could', 'other'].includes(word));

    // Get most frequent words
    const wordCount: Record<string, number> = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8) // Take top 8 terms for better matching
      .map(([word]) => word);
  }

  async deleteSessionsByFilters(filters: {
    olderThanDays: number;
    agentType?: string;
    projectContext?: string;
  }): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.olderThanDays);
    const cutoffISO = cutoffDate.toISOString();

    let sql = 'DELETE FROM chat_sessions WHERE created_at < ?';
    let params: any[] = [cutoffISO];

    if (filters.agentType) {
      sql += ' AND agent_type = ?';
      params.push(filters.agentType);
    }

    if (filters.projectContext) {
      sql += ' AND project_context = ?';
      params.push(filters.projectContext);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);

    this.logger.info(`✅ Deleted ${result.changes} sessions with filters:`, filters);
    return result.changes;
  }

  async getSessionStats(): Promise<SessionStats> {
    if (!this.db) throw new Error('Database not initialized');

    // Simple stats implementation
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM chat_sessions');
    const total = totalStmt.get() as { count: number };

    const agentStmt = this.db.prepare('SELECT agent_type, COUNT(*) as count FROM chat_sessions GROUP BY agent_type');
    const agentResults = agentStmt.all() as { agent_type: string; count: number }[];

    const projectStmt = this.db.prepare('SELECT project_context, COUNT(*) as count FROM chat_sessions WHERE project_context IS NOT NULL GROUP BY project_context');
    const projectResults = projectStmt.all() as { project_context: string; count: number }[];

    const sessions_by_agent: Record<string, number> = {};
    agentResults.forEach(row => {
      sessions_by_agent[row.agent_type] = row.count;
    });

    const sessions_by_project: Record<string, number> = {};
    projectResults.forEach(row => {
      sessions_by_project[row.project_context] = row.count;
    });

    return {
      total_sessions: total.count,
      sessions_by_agent,
      sessions_by_project,
      recent_activity: []
    };
  }
} 