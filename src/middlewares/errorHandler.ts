import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, NotFoundError, ApiErrorEnvelope } from '../errors/index.js';
import { env } from '../config/env.js';

/**
 * 404 Route Not Found middleware
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
};

/**
 * Global Centralized Error Handling Middleware
 * Enforces unified JSON error envelope:
 * { "error": { "code": "...", "message": "...", "details": [...] } }
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError | ZodError | any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // 1. Handled Application Operational Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toEnvelope());
    return;
  }

  // 2. Zod Schema Validation Errors
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    const envelope: ApiErrorEnvelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
      },
    };

    res.status(422).json(envelope);
    return;
  }

  // 3. Malformed JSON Body Syntax Errors (from express.json())
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    const envelope: ApiErrorEnvelope = {
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload in request body',
        details: [],
      },
    };

    res.status(400).json(envelope);
    return;
  }

  // 4. Prisma Unique Constraint Violation (P2002)
  if (err && typeof err === 'object' && err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'resource';
    const envelope: ApiErrorEnvelope = {
      error: {
        code: 'CONFLICT',
        message: `A record with this ${target} already exists`,
        details: [],
      },
    };

    res.status(409).json(envelope);
    return;
  }

  // 5. Unexpected / Unhandled Internal Server Errors
  if (env.NODE_ENV !== 'test') {
    console.error('Unhandled Server Error:', err);
  }

  const envelope: ApiErrorEnvelope = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred',
      details: [],
    },
  };

  res.status(500).json(envelope);
};
