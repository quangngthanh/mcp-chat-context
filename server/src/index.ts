import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { ChatContextServer } from './server';
import { Logger } from './utils/logger';

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

async function startServer() {
  try {
    const logger = new Logger('ServerBootstrap');
    
    logger.info('Starting Chat Context Server...');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    const app = express();
    
    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: false, // Disable for API usage
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS configuration
    app.use(cors({
      origin: true, // Allow all domains
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-Id', 'X-Agent-Type']
    }));
    
    // Body parsing middleware
    app.use(compression());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request logging middleware
    app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        agentId: req.get('X-Agent-Id'),
        agentType: req.get('X-Agent-Type')
      });
      next();
    });
    
    // Initialize Chat Context Server
    const chatContextServer = new ChatContextServer();
    await chatContextServer.initialize();
    
    // Mount API routes
    app.use('/api', chatContextServer.getRouter());
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
      });
    });
    
    // Error handling middleware
    app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);
      
      res.status(error.status || 500).json({
        error: {
          message: error.message || 'Internal Server Error',
          status: error.status || 500,
          timestamp: new Date().toISOString()
        }
      });
    });
    
    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        error: {
          message: 'Route not found',
          status: 404,
          path: req.originalUrl
        }
      });
    });
    
    // Start listening
    const server = app.listen(Number(PORT), HOST, () => {
      logger.info(`🚀 Chat Context Server running on http://${HOST}:${PORT}`);
      logger.info('Available endpoints:');
      logger.info('  GET  /health                    - Health check');
      logger.info('  POST /api/sessions              - Create chat session');
      logger.info('  GET  /api/sessions/:id          - Get specific session');
      logger.info('  PUT  /api/sessions/:id          - Update session');
      logger.info('  DELETE /api/sessions/:id        - Delete session');
      logger.info('  GET  /api/sessions/search       - Search sessions');
      logger.info('  GET  /api/sessions/recent       - Get recent sessions');
      logger.info('  GET  /api/sessions/by-agent/:id - Get sessions by agent');
      logger.info('  POST /api/sessions/find-similar - Find similar sessions');
      logger.info('  POST /api/sessions/cleanup      - Cleanup old sessions');
      logger.info('  GET  /api/analytics/stats       - Get analytics stats');
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

if (require.main === module) {
  startServer();
}

export { startServer }; 