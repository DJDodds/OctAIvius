/**
 * Logger Utility
 *
 * This module provides a centralized logging system for the application using Winston.
 * It supports multiple log levels, file and console output, and structured logging.
 *
 * Features:
 * - Multiple log levels (error, warn, info, debug)
 * - File and console transports
 * - Log rotation and archiving
 * - Structured logging with metadata
 * - Request correlation IDs
 * - Error stack trace logging
 */

import winston from "winston";
import { config } from "../config/index";
import { formatDuration } from "./index";

// Define log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const logColors = {
  error: "red",
  warn: "yellow",
  info: "green",
  debug: "blue",
};

// Add colors to winston
winston.addColors(logColors);

/**
 * Custom log format for structured logging
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info: any) => {
    const { timestamp, level, message, stack, ...metadata } = info;
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    // Add stack trace for errors
    if (stack) {
      logMessage += `\n${stack}`;
    }

    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      logMessage += `\n${JSON.stringify(metadata, null, 2)}`;
    }

    return logMessage;
  })
);

/**
 * Console format for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: "HH:mm:ss",
  }),
  winston.format.printf((info: any) => {
    const { timestamp, level, message, stack, ...metadata } = info;
    let logMessage = `${timestamp} ${level}: ${message}`;

    if (stack) {
      logMessage += `\n${stack}`;
    }

    if (Object.keys(metadata).length > 0) {
      logMessage += `\n${JSON.stringify(metadata, null, 2)}`;
    }

    return logMessage;
  })
);

/**
 * Create Winston logger instance
 */
const transports: winston.transport[] = [];

// Console transport for development
if (config.logging.console.enabled) {
  transports.push(
    new winston.transports.Console({
      format: config.logging.console.colorize ? consoleFormat : logFormat,
      level: config.logging.level,
    })
  );
}

// File transport for persistent logging
if (config.logging.file.enabled) {
  transports.push(
    new winston.transports.File({
      filename: config.logging.file.path,
      format: logFormat,
      level: config.logging.level,
      maxsize: parseFileSize(config.logging.file.maxSize),
      maxFiles: config.logging.file.maxFiles,
      tailable: true,
    })
  );
}

// Error-specific file transport
if (config.logging.file.enabled) {
  transports.push(
    new winston.transports.File({
      filename: config.logging.file.path.replace(".log", ".error.log"),
      format: logFormat,
      level: "error",
      maxsize: parseFileSize(config.logging.file.maxSize),
      maxFiles: config.logging.file.maxFiles,
      tailable: true,
    })
  );
}

/**
 * Parse file size string to bytes
 */
function parseFileSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/i);
  if (!match || !match[1]) {
    return 10 * 1024 * 1024; // Default 10MB
  }

  const size = parseFloat(match[1]);
  const unit = (match[2] || "B").toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  return size * (multipliers[unit] || 1);
}

/**
 * Create the logger instance
 */
const logger = winston.createLogger({
  levels: logLevels,
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
});

/**
 * Enhanced logging interface with additional methods
 */
export class Logger {
  private correlationId?: string;

  constructor(correlationId?: string) {
    if (correlationId) {
      this.correlationId = correlationId;
    }
  }

  /**
   * Logs an error message
   */
  error(message: string, error?: Error, metadata?: any): void {
    const logData: any = {
      message,
      correlationId: this.correlationId,
      ...metadata,
    };

    if (error) {
      logData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    logger.error(logData);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, metadata?: any): void {
    logger.warn({
      message,
      correlationId: this.correlationId,
      ...metadata,
    });
  }

  /**
   * Logs an info message
   */
  info(message: string, metadata?: any): void {
    logger.info({
      message,
      correlationId: this.correlationId,
      ...metadata,
    });
  }

  /**
   * Logs a debug message
   */
  debug(message: string, metadata?: any): void {
    logger.debug({
      message,
      correlationId: this.correlationId,
      ...metadata,
    });
  }

  /**
   * Logs HTTP request information
   */
  request(req: any, res?: any, duration?: number): void {
    const logData: any = {
      method: req.method,
      url: req.url,
      userAgent: req.get("User-Agent"),
      ip: req.ip,
      correlationId: this.correlationId || req.requestId,
    };

    if (res) {
      logData.statusCode = res.statusCode;
      logData.contentLength = res.get("Content-Length");
    }

    if (duration) {
      logData.duration = `${duration}ms`;
      logData.durationFormatted = formatDuration(duration);
    }

    this.info("HTTP Request", logData);
  }

  /**
   * Logs function execution timing
   */
  performance(operation: string, duration: number, metadata?: any): void {
    this.info(`Performance: ${operation}`, {
      operation,
      duration: `${duration}ms`,
      durationFormatted: formatDuration(duration),
      correlationId: this.correlationId,
      ...metadata,
    });
  }

  /**
   * Logs security-related events
   */
  security(event: string, details: any): void {
    this.warn(`Security Event: ${event}`, {
      event,
      correlationId: this.correlationId,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  /**
   * Logs audit events for compliance
   */
  audit(
    action: string,
    userId?: string,
    resource?: string,
    details?: any
  ): void {
    this.info(`Audit: ${action}`, {
      action,
      userId,
      resource,
      correlationId: this.correlationId,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  /**
   * Creates a child logger with correlation ID
   */
  child(correlationId: string): Logger {
    return new Logger(correlationId);
  }
}

/**
 * Default logger instance
 */
export const defaultLogger = new Logger();

/**
 * Express middleware for request logging
 */
export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const logger = new Logger(req.requestId);

    // Add logger to request for use in controllers
    req.logger = logger;

    // Log incoming request
    logger.request(req);

    // Override res.end to capture response details
    const originalEnd = res.end;
    res.end = function (chunk: any, encoding: any) {
      const duration = Date.now() - startTime;
      logger.request(req, res, duration);
      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

/**
 * Utility function to measure and log function execution time
 */
export function logExecutionTime<T extends (...args: any[]) => any>(
  fn: T,
  operationName: string,
  logger?: Logger
): T {
  return ((...args: Parameters<T>) => {
    const start = Date.now();
    const log = logger || defaultLogger;

    try {
      const result = fn(...args);

      // Handle async functions
      if (result && typeof result.then === "function") {
        return result
          .then((value: any) => {
            const duration = Date.now() - start;
            log.performance(operationName, duration, { success: true });
            return value;
          })
          .catch((error: any) => {
            const duration = Date.now() - start;
            log.performance(operationName, duration, { success: false });
            log.error(`Error in ${operationName}`, error);
            throw error;
          });
      } else {
        // Handle sync functions
        const duration = Date.now() - start;
        log.performance(operationName, duration, { success: true });
        return result;
      }
    } catch (error) {
      const duration = Date.now() - start;
      log.performance(operationName, duration, { success: false });
      log.error(`Error in ${operationName}`, error as Error);
      throw error;
    }
  }) as T;
}

/**
 * Decorator for logging method execution time (experimental)
 */
export function LogExecutionTime(operationName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const opName = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = logExecutionTime(originalMethod, opName);
    return descriptor;
  };
}

// Export the winston logger for direct access if needed
export { logger as winstonLogger };

// Export log levels for external use
export { logLevels };
