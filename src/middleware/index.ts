/**
 * Middleware Collection
 *
 * This module contains all Express middleware functions used throughout the application.
 * Each middleware handles specific concerns like authentication, validation, error handling,
 * rate limiting, and security.
 */

import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import jwt from "jsonwebtoken";
import { config } from "../config/index";
import { Logger } from "../utils/logger";
import { generateRequestId, isValidUUID } from "../utils/index";
import { AppError, ApiResponse, User, JWTPayload } from "../types/index";

/**
 * Request ID middleware
 * Generates a unique ID for each request for tracking and correlation
 */
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  req.requestId = generateRequestId();
  res.setHeader("X-Request-ID", req.requestId);
  next();
}

/**
 * Request timing middleware
 * Tracks request start time for performance monitoring
 */
export function requestTiming(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  req.startTime = Date.now();
  next();
}

/**
 * CORS middleware configuration
 * Handles cross-origin requests with security policies
 */
export const corsMiddleware = cors({
  origin: config.security.cors.origin,
  methods: config.security.cors.methods,
  credentials: config.security.cors.credentials,
  optionsSuccessStatus: config.security.cors.optionsSuccessStatus,
  maxAge: 86400, // 24 hours
});

/**
 * Security middleware using Helmet
 * Adds various security headers to protect against common vulnerabilities
 */
export const securityMiddleware = helmet({
  contentSecurityPolicy: config.security.helmet.contentSecurityPolicy
    ? {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      }
    : false,
  hsts: config.security.helmet.hsts
    ? {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      }
    : false,
  noSniff: config.security.helmet.noSniff,
  xssFilter: config.security.helmet.xssFilter,
});

/**
 * Compression middleware
 * Compresses response bodies to reduce bandwidth usage
 */
export const compressionMiddleware = compression({
  filter: (req: Request, res: Response) => {
    if (req.headers["x-no-compression"]) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress responses larger than 1KB
});

/**
 * Rate limiting middleware
 * Prevents abuse by limiting the number of requests per IP
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later.",
      timestamp: new Date(),
      requestId: "",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: config.security.rateLimit.skipSuccessfulRequests,
  skipFailedRequests: config.security.rateLimit.skipFailedRequests,
  keyGenerator: (req: Request): string => {
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id || req.ip || "unknown";
  },
  handler: (req: Request, res: Response) => {
    const logger = new Logger(req.requestId);
    logger.security("Rate limit exceeded", {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      url: req.url,
      method: req.method,
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests, please try again later.",
        timestamp: new Date(),
        requestId: req.requestId,
      },
    };

    res.status(StatusCodes.TOO_MANY_REQUESTS).json(response);
  },
});

/**
 * Authentication middleware
 * Verifies JWT tokens and attaches user information to requests
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const logger = new Logger(req.requestId);

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(
        "Access token is required",
        StatusCodes.UNAUTHORIZED,
        "MISSING_TOKEN"
      );
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      throw new AppError(
        "Access token is required",
        StatusCodes.UNAUTHORIZED,
        "MISSING_TOKEN"
      );
    }

    // Verify JWT token
    const payload = jwt.verify(token, config.auth.jwtSecret) as JWTPayload;

    // Create user object from JWT payload
    const user: User = {
      id: payload.userId,
      username: payload.username,
      email: "", // Would be loaded from database in real implementation
      roles: payload.roles.map((roleName) => ({
        id: roleName,
        name: roleName,
        permissions: payload.permissions,
        description: `${roleName} role`,
      })),
      permissions: payload.permissions,
      createdAt: new Date(),
      isActive: true,
    };

    // Attach user to request
    req.user = user;

    logger.debug("User authenticated successfully", {
      userId: user.id,
      username: user.username,
      roles: payload.roles,
    });

    next();
  } catch (error) {
    logger.security("Authentication failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      url: req.url,
    });

    if (error instanceof jwt.JsonWebTokenError) {
      next(
        new AppError(
          "Invalid access token",
          StatusCodes.UNAUTHORIZED,
          "INVALID_TOKEN"
        )
      );
    } else if (error instanceof jwt.TokenExpiredError) {
      next(
        new AppError(
          "Access token has expired",
          StatusCodes.UNAUTHORIZED,
          "TOKEN_EXPIRED"
        )
      );
    } else {
      next(error);
    }
  }
}

/**
 * Optional authentication middleware
 * Same as authenticate but doesn't fail if no token is provided
 */
export function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.headers.authorization) {
    return next();
  }

  authenticate(req, res, next);
}

/**
 * Authorization middleware factory
 * Creates middleware that checks if user has required permissions
 */
export function authorize(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const logger = new Logger(req.requestId);

    if (!req.user) {
      throw new AppError(
        "Authentication is required",
        StatusCodes.UNAUTHORIZED,
        "NOT_AUTHENTICATED"
      );
    }

    const userPermissions = req.user.permissions;
    const hasPermission = requiredPermissions.every(
      (permission) =>
        userPermissions.includes(permission) ||
        userPermissions.includes("admin")
    );

    if (!hasPermission) {
      logger.security("Authorization failed", {
        userId: req.user.id,
        requiredPermissions,
        userPermissions,
        url: req.url,
        method: req.method,
      });

      throw new AppError(
        "Insufficient permissions",
        StatusCodes.FORBIDDEN,
        "INSUFFICIENT_PERMISSIONS"
      );
    }

    logger.debug("User authorized successfully", {
      userId: req.user.id,
      requiredPermissions,
      userPermissions,
    });

    next();
  };
}

/**
 * Role-based authorization middleware factory
 * Creates middleware that checks if user has required roles
 */
export function requireRole(...requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const logger = new Logger(req.requestId);

    if (!req.user) {
      throw new AppError(
        "Authentication is required",
        StatusCodes.UNAUTHORIZED,
        "NOT_AUTHENTICATED"
      );
    }

    const userRoles = req.user.roles.map((role: any) => role.name);
    const hasRole = requiredRoles.some(
      (role) => userRoles.includes(role) || userRoles.includes("admin")
    );

    if (!hasRole) {
      logger.security("Role authorization failed", {
        userId: req.user.id,
        requiredRoles,
        userRoles,
        url: req.url,
        method: req.method,
      });

      throw new AppError(
        "Required role not found",
        StatusCodes.FORBIDDEN,
        "INSUFFICIENT_ROLE"
      );
    }

    logger.debug("User role authorized successfully", {
      userId: req.user.id,
      requiredRoles,
      userRoles,
    });

    next();
  };
}

/**
 * Validation middleware factory
 * Creates middleware that validates request data using Joi schemas
 */
export function validate(
  schema: any,
  source: "body" | "query" | "params" = "body"
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const logger = new Logger(req.requestId);

    try {
      const dataToValidate = req[source];
      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errorMessages = error.details.map((detail: any) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));

        logger.warn("Validation failed", {
          source,
          errors: errorMessages,
          data: dataToValidate,
        });

        throw new AppError(
          "Validation failed",
          StatusCodes.BAD_REQUEST,
          "VALIDATION_ERROR",
          true
        );
      }

      // Replace the original data with validated and sanitized data
      (req as any)[source] = value;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * UUID validation middleware
 * Validates that URL parameters are valid UUIDs
 */
export function validateUUID(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const logger = new Logger(req.requestId);

    for (const paramName of paramNames) {
      const paramValue = req.params[paramName];

      if (paramValue && !isValidUUID(paramValue)) {
        logger.warn("Invalid UUID parameter", {
          paramName,
          paramValue,
          url: req.url,
        });

        throw new AppError(
          `Invalid ${paramName} format`,
          StatusCodes.BAD_REQUEST,
          "INVALID_UUID"
        );
      }
    }

    next();
  };
}

/**
 * Content type validation middleware
 * Ensures requests have the correct content type
 */
export function requireContentType(contentType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const logger = new Logger(req.requestId);

    if (!req.is(contentType)) {
      logger.warn("Invalid content type", {
        expected: contentType,
        received: req.get("Content-Type"),
        url: req.url,
      });

      throw new AppError(
        `Content-Type must be ${contentType}`,
        StatusCodes.UNSUPPORTED_MEDIA_TYPE,
        "INVALID_CONTENT_TYPE"
      );
    }

    next();
  };
}

/**
 * Request size limit middleware
 * Limits the size of request bodies
 */
export function limitRequestSize(maxSize: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get("Content-Length") || "0");

    if (contentLength > maxSize) {
      const logger = new Logger(req.requestId);
      logger.warn("Request size limit exceeded", {
        contentLength,
        maxSize,
        url: req.url,
      });

      throw new AppError(
        "Request entity too large",
        StatusCodes.REQUEST_TOO_LONG,
        "REQUEST_TOO_LARGE"
      );
    }

    next();
  };
}

/**
 * Error handling middleware
 * Centralized error handling with proper logging and response formatting
 */
export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const logger = new Logger(req.requestId);

  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let errorCode = "INTERNAL_ERROR";
  let message = "An unexpected error occurred";

  // Handle different error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    message = error.message;

    if (error.isOperational) {
      logger.warn("Operational error occurred", {
        code: errorCode,
        message: message,
        statusCode: statusCode,
        url: req.url,
        method: req.method,
        userId: req.user?.id,
      });
    } else {
      logger.error("Programming error occurred", error, {
        url: req.url,
        method: req.method,
        userId: req.user?.id,
      });
    }
  } else if (error.name === "ValidationError") {
    statusCode = StatusCodes.BAD_REQUEST;
    errorCode = "VALIDATION_ERROR";
    message = "Invalid input data";

    logger.warn("Validation error", {
      error: error.message,
      url: req.url,
      method: req.method,
    });
  } else if (error.name === "CastError") {
    statusCode = StatusCodes.BAD_REQUEST;
    errorCode = "INVALID_ID";
    message = "Invalid ID format";

    logger.warn("Cast error", {
      error: error.message,
      url: req.url,
      method: req.method,
    });
  } else {
    // Log unexpected errors with full details
    logger.error("Unexpected error occurred", error, {
      url: req.url,
      method: req.method,
      userId: req.user?.id,
      body: req.body,
      query: req.query,
      params: req.params,
    });
  }

  const response: ApiResponse = {
    success: false,
    error: {
      code: errorCode,
      message: message,
      timestamp: new Date(),
      requestId: req.requestId,
    },
  };

  res.status(statusCode).json(response);
}

/**
 * 404 Not Found middleware
 * Handles requests to non-existent endpoints
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const logger = new Logger(req.requestId);

  logger.warn("Endpoint not found", {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  const response: ApiResponse = {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Endpoint ${req.method} ${req.url} not found`,
      timestamp: new Date(),
      requestId: req.requestId,
    },
  };

  res.status(StatusCodes.NOT_FOUND).json(response);
}

/**
 * Health check middleware
 * Provides endpoint for service health monitoring
 */
export function healthCheck(req: Request, res: Response): void {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  const health = {
    status: "healthy",
    timestamp: new Date(),
    uptime: uptime,
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
    },
    environment: config.server.environment,
    version: process.env.npm_package_version || "1.0.0",
  };

  res.json(health);
}
