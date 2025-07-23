import winston from 'winston';

export class Logger {
  private logger: winston.Logger;
  private context: string;

  constructor(context: string) {
    this.context = context;
    
    const format = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}] [${this.context}] ${message}`;
        
        if (Object.keys(meta).length > 0) {
          log += ` ${JSON.stringify(meta)}`;
        }
        
        if (stack) {
          log += `\n${stack}`;
        }
        
        return log;
      })
    );

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format,
      transports: [
        // Console transport
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            format
          )
        }),
        
        // Single file transport for all logs
        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 20 * 1024 * 1024, // 20MB (tăng size vì gộp tất cả)
          maxFiles: 5,
          tailable: true
        })
      ],
      
      // Handle exceptions - ghi vào cùng file combined.log
      exceptionHandlers: [
        new winston.transports.File({ 
          filename: 'logs/combined.log',
          maxsize: 20 * 1024 * 1024,
          maxFiles: 5
        })
      ],
      
      // Handle rejections - ghi vào cùng file combined.log
      rejectionHandlers: [
        new winston.transports.File({ 
          filename: 'logs/combined.log',
          maxsize: 20 * 1024 * 1024,
          maxFiles: 5
        })
      ]
    });
  }

  info(message: string, meta?: any) {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: any) {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: any) {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: any) {
    this.logger.debug(message, meta);
  }

  verbose(message: string, meta?: any) {
    this.logger.verbose(message, meta);
  }
} 