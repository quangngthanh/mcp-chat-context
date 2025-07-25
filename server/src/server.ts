import express, { Request, Response, Router } from 'express';
import { DatabaseBetter as Database } from './database/database-better';
import { Logger } from './utils/logger';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { validateSessionData, validateSearchParams } from './utils/validation';

export class ChatContextServer {
  private db: Database;
  private logger: Logger;
  private router: Router;
  private rateLimiter: RateLimiterMemory;

  constructor() {
    this.logger = new Logger('ChatContextServer');
    this.db = new Database();
    this.router = express.Router();
    
    // Rate limiting: 100 requests per minute per IP
    this.rateLimiter = new RateLimiterMemory({
      points: 100,
      duration: 60,
    });

    this.setupRoutes();
  }

  async initialize(): Promise<void> {
    try {
      await this.db.initialize();
      this.logger.info('✅ Chat Context Server initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Chat Context Server:', error);
      throw error;
    }
  }

  private setupRoutes(): void {
    // Apply rate limiting to all routes
    this.router.use(async (req: Request, res: Response, next) => {
      try {
        const key = req.ip || req.socket.remoteAddress || 'unknown';
        await this.rateLimiter.consume(key);
        next();
      } catch (rateLimiterRes: any) {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.round(rateLimiterRes.msBeforeNext / 1000) || 1,
        });
      }
    });

    // Session Management Routes
    this.router.post('/sessions', this.createSession.bind(this));
    
    // Search & Query Routes
    this.router.get('/sessions/search', this.searchSessions.bind(this));
    this.router.get('/sessions/recent', this.getRecentSessions.bind(this));
    this.router.get('/sessions/by-agent/:agentId', this.getSessionsByAgent.bind(this));
    this.router.post('/sessions/find-similar', this.findSimilarSessions.bind(this));
    this.router.post('/sessions/cleanup', this.cleanupSessions.bind(this));
    
    // Generic Session Routes
    this.router.get('/sessions/:id', this.getSession.bind(this));
    this.router.put('/sessions/:id', this.updateSession.bind(this));
    this.router.delete('/sessions/:id', this.deleteSession.bind(this));

    // Analytics Routes
    this.router.get('/analytics/stats', this.getAnalytics.bind(this));
  }

  private async createSession(req: Request, res: Response): Promise<void> {
    try {
      const {
        title,
        agentId,
        agentType,
        chatContent,
        projectContext,
        tags = []
      } = req.body;

      // Validate input data
      const validationError = validateSessionData(req.body);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      // NO PROCESSING - LƯU RAW CONTENT TRỰC TIẾP
      const sessionData = {
        title: title || `Chat Session - ${new Date().toISOString().split('T')[0]}`,
        agent_id: agentId,
        agent_type: agentType,
        project_context: projectContext,
        original_content: chatContent, // RAW CONTENT - KHÔNG XỬ LÝ GÌ CẢ
        tags: JSON.stringify(tags)
      };

      const sessionId = await this.db.createSession(sessionData);

      this.logger.info(`✅ Session created: ${sessionId}`, {
        agentId,
        agentType,
        projectContext,
        contentLength: chatContent.length
      });

      res.status(201).json({
        sessionId,
        title: sessionData.title,
        originalContentLength: chatContent.length,
        createdAt: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to create session:', error);
      res.status(500).json({
        error: 'Failed to create session',
        message: (error as Error).message
      });
    }
  }

  private async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const session = await this.db.getSession(id);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // TRẢ VỀ TOÀN BỘ - KHÔNG XỬ LÝ GÌ
      const responseSession = {
        ...session,
        tags: JSON.parse(session.tags) // Chỉ parse JSON tags
      };

      res.json(responseSession);

    } catch (error) {
      this.logger.error('Failed to get session:', error);
      res.status(500).json({
        error: 'Failed to retrieve session',
        message: (error as Error).message
      });
    }
  }

  private async updateSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Process JSON fields
      if (updates.tags && Array.isArray(updates.tags)) {
        updates.tags = JSON.stringify(updates.tags);
      }

      const success = await this.db.updateSession(id, updates);

      if (!success) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({ message: 'Session updated successfully' });

    } catch (error) {
      this.logger.error('Failed to update session:', error);
      res.status(500).json({
        error: 'Failed to update session',
        message: (error as Error).message
      });
    }
  }

  private async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const success = await this.db.deleteSession(id);

      if (!success) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({ message: 'Session deleted successfully' });

    } catch (error) {
      this.logger.error('Failed to delete session:', error);
      res.status(500).json({
        error: 'Failed to delete session',
        message: (error as Error).message
      });
    }
  }

  private async searchSessions(req: Request, res: Response): Promise<void> {
    try {
      const validationError = validateSearchParams(req.query);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      const {
        query,
        agentType,
        projectContext,
        tags,
        dateFrom,
        dateTo,
        limit = '10',
        offset = '0'
      } = req.query;

      const searchFilters = {
        query: query as string,
        agentType: agentType as string,
        projectContext: projectContext as string,
        tags: tags ? (tags as string).split(',') : undefined,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10)
      };

      const results = await this.db.searchSessions(searchFilters);

      // Parse JSON fields for response
      const responseResults = results.map(session => ({
        ...session,
        tags: JSON.parse(session.tags)
      }));

      res.json({
        results: responseResults,
        count: responseResults.length,
        searchParams: searchFilters
      });

    } catch (error) {
      this.logger.error('Failed to search sessions:', error);
      res.status(500).json({
        error: 'Failed to search sessions',
        message: (error as Error).message
      });
    }
  }

  private async getRecentSessions(req: Request, res: Response): Promise<void> {
    try {
      const { limit = '10', agentType } = req.query;
      const sessions = await this.db.getRecentSessions(
        parseInt(limit as string, 10),
        agentType as string
      );

      // Parse JSON fields for response
      const responseSessions = sessions.map(session => ({
        ...session,
        tags: JSON.parse(session.tags)
      }));

      res.json(responseSessions);

    } catch (error) {
      this.logger.error('Failed to get recent sessions:', error);
      res.status(500).json({
        error: 'Failed to get recent sessions',
        message: (error as Error).message
      });
    }
  }

  private async getSessionsByAgent(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const { limit = '20' } = req.query;

      const sessions = await this.db.getSessionsByAgent(
        agentId,
        parseInt(limit as string, 10)
      );

      // Parse JSON fields for response
      const responseSessions = sessions.map(session => ({
        ...session,
        tags: JSON.parse(session.tags)
      }));

      res.json(responseSessions);

    } catch (error) {
      this.logger.error('Failed to get sessions by agent:', error);
      res.status(500).json({
        error: 'Failed to get sessions by agent',
        message: (error as Error).message
      });
    }
  }

  private async findSimilarSessions(req: Request, res: Response): Promise<void> {
    try {
      const { content, limit = 5 } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({ error: 'Content is required and must be a string' });
        return;
      }

      // Use basic similarity search based on content
      const similarSessions = await this.db.findSimilarSessions(content, limit);

      // Parse JSON fields for response
      const responseSessions = similarSessions.map(session => ({
        ...session,
        tags: JSON.parse(session.tags)
      }));

      // Extract key terms from the content for "basedOn" field
      const basedOn = this.extractKeyTerms(content);

      res.json({
        similarSessions: responseSessions,
        count: responseSessions.length,
        basedOn: basedOn
      });

    } catch (error) {
      this.logger.error('Failed to find similar sessions:', error);
      res.status(500).json({
        error: 'Failed to find similar sessions',
        message: (error as Error).message
      });
    }
  }

  private async cleanupSessions(req: Request, res: Response): Promise<void> {
    try {
      const { 
        olderThanDays = 30, 
        agentType, 
        projectContext 
      } = req.body;

      if (typeof olderThanDays !== 'number' || olderThanDays < 1) {
        res.status(400).json({ error: 'olderThanDays must be a positive number' });
        return;
      }

      let deletedCount = 0;
      let message = '';

      if (agentType && projectContext) {
        // Delete by both agent and project
        deletedCount = await this.db.deleteSessionsByFilters({
          olderThanDays,
          agentType,
          projectContext
        });
        message = `Deleted sessions older than ${olderThanDays} days for agent "${agentType}" and project "${projectContext}"`;

      } else if (agentType) {
        // Delete by agent type with date filter
        deletedCount = await this.db.deleteSessionsByFilters({
          olderThanDays,
          agentType
        });
        message = `Deleted sessions older than ${olderThanDays} days for agent "${agentType}"`;

      } else if (projectContext) {
        // Delete by project with date filter
        deletedCount = await this.db.deleteSessionsByFilters({
          olderThanDays,
          projectContext
        });
        message = `Deleted sessions older than ${olderThanDays} days for project "${projectContext}"`;

      } else {
        // Delete only by date
        deletedCount = await this.db.deleteOldSessions(olderThanDays);
        message = `Deleted sessions older than ${olderThanDays} days`;
      }

      this.logger.info(`Cleanup completed: ${deletedCount} sessions deleted`);

      res.json({
        deletedCount,
        message,
        olderThanDays,
        agentType: agentType || null,
        projectContext: projectContext || null
      });

    } catch (error) {
      this.logger.error('Failed to cleanup sessions:', error);
      res.status(500).json({
        error: 'Failed to cleanup sessions',
        message: (error as Error).message
      });
    }
  }

  private extractKeyTerms(content: string): string[] {
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
      .slice(0, 5)
      .map(([word]) => word);
  }

  private async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.db.getSessionStats();
      res.json(stats);

    } catch (error) {
      this.logger.error('Failed to get analytics:', error);
      res.status(500).json({
        error: 'Failed to get analytics',
        message: (error as Error).message
      });
    }
  }

  getRouter(): Router {
    return this.router;
  }

  async shutdown(): Promise<void> {
    try {
      await this.db.close();
      this.logger.info('Chat Context Server shut down successfully');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }
} 