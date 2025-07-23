import express, { Request, Response, Router } from 'express';
import { DatabaseBetter as Database } from './database/database-better';
import { Logger } from './utils/logger';
import { ChatContentProcessor } from './utils/chat-processor';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { validateSessionData, validateSearchParams } from './utils/validation';

export class ChatContextServer {
  private db: Database;
  private logger: Logger;
  private router: Router;
  private chatProcessor: ChatContentProcessor;
  private rateLimiter: RateLimiterMemory;

  constructor() {
    this.logger = new Logger('ChatContextServer');
    this.db = new Database();
    this.chatProcessor = new ChatContentProcessor();
    this.router = express.Router();
    
    // Rate limiting: 100 requests per minute per IP
    this.rateLimiter = new RateLimiterMemory({
      keyGenerator: (req: Request) => req.ip,
      points: 100,
      duration: 60,
    });

    this.setupRoutes();
  }

  async initialize(): Promise<void> {
    try {
      await this.db.initialize();
      this.logger.info('Chat Context Server initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Chat Context Server:', error);
      throw error;
    }
  }

  private setupRoutes(): void {
    // Apply rate limiting to all routes
    this.router.use(async (req: Request, res: Response, next) => {
      try {
        await this.rateLimiter.consume(req.ip);
        next();
      } catch (rateLimiterRes) {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.round(rateLimiterRes.msBeforeNext / 1000) || 1,
        });
      }
    });

    // Session Management Routes
    this.router.post('/sessions', this.createSession.bind(this));
    this.router.get('/sessions/:id', this.getSession.bind(this));
    this.router.put('/sessions/:id', this.updateSession.bind(this));
    this.router.delete('/sessions/:id', this.deleteSession.bind(this));

    // Search & Query Routes
    this.router.get('/sessions/search', this.searchSessions.bind(this));
    this.router.get('/sessions/recent', this.getRecentSessions.bind(this));
    this.router.post('/sessions/find-similar', this.findSimilarSessions.bind(this));

    // Agent-specific Routes
    this.router.get('/sessions/by-agent/:agentId', this.getSessionsByAgent.bind(this));
    this.router.post('/sessions/merge', this.mergeSessions.bind(this));

    // Analytics Routes
    this.router.get('/analytics/stats', this.getAnalytics.bind(this));
    this.router.get('/analytics/usage', this.getUsageAnalytics.bind(this));

    // Utility Routes
    this.router.post('/sessions/bulk-import', this.bulkImportSessions.bind(this));
    this.router.post('/sessions/cleanup', this.cleanupOldSessions.bind(this));
  }

  private async createSession(req: Request, res: Response): Promise<void> {
    try {
      const {
        title,
        agentId,
        agentType,
        participants,
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

      // Process and compress chat content
      const processedContent = await this.chatProcessor.processContent(chatContent);

      const sessionData = {
        title: title || processedContent.generatedTitle,
        agent_id: agentId,
        agent_type: agentType,
        participants: JSON.stringify(participants || [agentType, 'user']),
        project_context: projectContext,
        context_summary: processedContent.summary,
        key_topics: JSON.stringify(processedContent.keyTopics),
        decisions_made: JSON.stringify(processedContent.decisions),
        code_snippets: JSON.stringify(processedContent.codeSnippets),
        tags: JSON.stringify(tags),
        session_hash: processedContent.contentHash
      };

      const sessionId = await this.db.createSession(sessionData);

      this.logger.info(`Session created: ${sessionId}`, {
        agentId,
        agentType,
        projectContext,
        topicsCount: processedContent.keyTopics.length
      });

      res.status(201).json({
        sessionId,
        title: sessionData.title,
        summary: processedContent.summary,
        keyTopics: processedContent.keyTopics,
        createdAt: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to create session:', error);
      res.status(500).json({
        error: 'Failed to create session',
        message: error.message
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

      // Parse JSON fields for response
      const responseSession = {
        ...session,
        participants: JSON.parse(session.participants),
        key_topics: JSON.parse(session.key_topics),
        decisions_made: JSON.parse(session.decisions_made),
        code_snippets: JSON.parse(session.code_snippets),
        tags: JSON.parse(session.tags)
      };

      res.json(responseSession);

    } catch (error) {
      this.logger.error('Failed to get session:', error);
      res.status(500).json({
        error: 'Failed to retrieve session',
        message: error.message
      });
    }
  }

  private async updateSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Validate update data
      const validationError = validateSessionData(updates, true);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      // Process JSON fields
      if (updates.participants) {
        updates.participants = JSON.stringify(updates.participants);
      }
      if (updates.key_topics) {
        updates.key_topics = JSON.stringify(updates.key_topics);
      }
      if (updates.decisions_made) {
        updates.decisions_made = JSON.stringify(updates.decisions_made);
      }
      if (updates.code_snippets) {
        updates.code_snippets = JSON.stringify(updates.code_snippets);
      }
      if (updates.tags) {
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
        message: error.message
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
        message: error.message
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
        participants: JSON.parse(session.participants),
        key_topics: JSON.parse(session.key_topics),
        decisions_made: JSON.parse(session.decisions_made),
        code_snippets: JSON.parse(session.code_snippets),
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
        message: error.message
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
        participants: JSON.parse(session.participants),
        key_topics: JSON.parse(session.key_topics),
        decisions_made: JSON.parse(session.decisions_made),
        code_snippets: JSON.parse(session.code_snippets),
        tags: JSON.parse(session.tags)
      }));

      res.json(responseSessions);

    } catch (error) {
      this.logger.error('Failed to get recent sessions:', error);
      res.status(500).json({
        error: 'Failed to get recent sessions',
        message: error.message
      });
    }
  }

  private async findSimilarSessions(req: Request, res: Response): Promise<void> {
    try {
      const { content, limit = 5 } = req.body;

      if (!content) {
        res.status(400).json({ error: 'Content is required for similarity search' });
        return;
      }

      // Process content to extract key terms
      const processedContent = await this.chatProcessor.processContent(content);
      const searchQuery = processedContent.keyTopics.join(' ');

      const results = await this.db.searchSessions({
        query: searchQuery,
        limit: parseInt(limit as string, 10)
      });

      res.json({
        similarSessions: results,
        basedOn: processedContent.keyTopics,
        count: results.length
      });

    } catch (error) {
      this.logger.error('Failed to find similar sessions:', error);
      res.status(500).json({
        error: 'Failed to find similar sessions',
        message: error.message
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

      res.json(sessions);

    } catch (error) {
      this.logger.error('Failed to get sessions by agent:', error);
      res.status(500).json({
        error: 'Failed to get sessions by agent',
        message: error.message
      });
    }
  }

  private async mergeSessions(req: Request, res: Response): Promise<void> {
    try {
      const { sessionIds, newTitle } = req.body;

      if (!sessionIds || sessionIds.length < 2) {
        res.status(400).json({ 
          error: 'At least 2 session IDs are required for merging' 
        });
        return;
      }

      // This is a complex operation that would merge multiple sessions
      // For now, return not implemented
      res.status(501).json({
        error: 'Session merging not yet implemented',
        plannedFor: 'v1.1.0'
      });

    } catch (error) {
      this.logger.error('Failed to merge sessions:', error);
      res.status(500).json({
        error: 'Failed to merge sessions',
        message: error.message
      });
    }
  }

  private async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.db.getSessionStats();
      res.json(stats);

    } catch (error) {
      this.logger.error('Failed to get analytics:', error);
      res.status(500).json({
        error: 'Failed to get analytics',
        message: error.message
      });
    }
  }

  private async getUsageAnalytics(req: Request, res: Response): Promise<void> {
    try {
      // Placeholder for usage analytics
      res.json({
        message: 'Usage analytics endpoint - to be implemented',
        version: '1.0.0'
      });

    } catch (error) {
      this.logger.error('Failed to get usage analytics:', error);
      res.status(500).json({
        error: 'Failed to get usage analytics',
        message: error.message
      });
    }
  }

  private async bulkImportSessions(req: Request, res: Response): Promise<void> {
    try {
      const { sessions } = req.body;

      if (!sessions || !Array.isArray(sessions)) {
        res.status(400).json({ error: 'Sessions array is required' });
        return;
      }

      // Placeholder for bulk import
      res.status(501).json({
        error: 'Bulk import not yet implemented',
        plannedFor: 'v1.1.0'
      });

    } catch (error) {
      this.logger.error('Failed to bulk import sessions:', error);
      res.status(500).json({
        error: 'Failed to bulk import sessions',
        message: error.message
      });
    }
  }

  private async cleanupOldSessions(req: Request, res: Response): Promise<void> {
    try {
      const { daysOld = 30 } = req.body;

      // Placeholder for cleanup
      res.status(501).json({
        error: 'Session cleanup not yet implemented',
        plannedFor: 'v1.1.0'
      });

    } catch (error) {
      this.logger.error('Failed to cleanup sessions:', error);
      res.status(500).json({
        error: 'Failed to cleanup sessions',
        message: error.message
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