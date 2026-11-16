export interface ApiErrorDetail {
  field?: string;
  message: string;
  [key: string]: unknown;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

/**
 * Base Application Error class for operational exceptions
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown[];
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_SERVER_ERROR",
    details: unknown[] = [],
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Maintain proper stack trace in V8 engines
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serializes the error into the standardized API response envelope
   */
  public toEnvelope(): ApiErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * 400 Bad Request
 */
export class BadRequestError extends AppError {
  constructor(
    message: string = "Bad request",
    code: string = "BAD_REQUEST",
    details: unknown[] = [],
  ) {
    super(message, 400, code, details);
  }
}

/**
 * 401 Unauthorized (Missing or invalid credentials/token)
 */
export class UnauthorizedError extends AppError {
  constructor(
    message: string = "Unauthorized access",
    code: string = "UNAUTHORIZED",
    details: unknown[] = [],
  ) {
    super(message, 401, code, details);
  }
}

/**
 * 403 Forbidden (Authenticated but lacking required permissions)
 */
export class ForbiddenError extends AppError {
  constructor(
    message: string = "Access forbidden",
    code: string = "FORBIDDEN",
    details: unknown[] = [],
  ) {
    super(message, 403, code, details);
  }
}

/**
 * 404 Not Found (Resource or route does not exist)
 */
export class NotFoundError extends AppError {
  constructor(
    message: string = "Resource not found",
    code: string = "NOT_FOUND",
    details: unknown[] = [],
  ) {
    super(message, 404, code, details);
  }
}

/**
 * 409 Conflict (Duplicate email, conflict in state)
 */
export class ConflictError extends AppError {
  constructor(
    message: string = "Resource conflict",
    code: string = "CONFLICT",
    details: unknown[] = [],
  ) {
    super(message, 409, code, details);
  }
}

/**
 * 422 Unprocessable Entity / Validation Error (Invalid schema, field errors)
 */
export class ValidationError extends AppError {
  constructor(
    message: string = "Validation failed",
    details: unknown[] = [],
    code: string = "VALIDATION_ERROR",
  ) {
    super(message, 422, code, details);
  }
}

/**
 * 500 Internal Server Error (Unexpected runtime failures)
 */
export class InternalServerError extends AppError {
  constructor(
    message: string = "An unexpected internal server error occurred",
    code: string = "INTERNAL_SERVER_ERROR",
    details: unknown[] = [],
  ) {
    super(message, 500, code, details, false);
  }
}
