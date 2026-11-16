import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { z } from 'zod';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  InternalServerError,
} from '../src/errors/index.js';
import { errorHandler, notFoundHandler, asyncHandler } from '../src/middlewares/index.js';
import { app } from '../src/app.js';

describe('Custom Error Classes & Exception Serialization (Unit Tests)', () => {
  it('should initialize AppError with all default and custom properties', () => {
    const error = new AppError('Something went wrong', 500, 'CUSTOM_ERROR', [{ info: 'extra' }], true);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Something went wrong');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('CUSTOM_ERROR');
    expect(error.details).toEqual([{ info: 'extra' }]);
    expect(error.isOperational).toBe(true);
    expect(error.stack).toBeDefined();
  });

  it('should serialize custom exceptions to unified error envelope via toEnvelope()', () => {
    const details = [{ field: 'title', message: 'Title is required' }];
    const error = new ValidationError('Validation failed', details);

    const serialized = error.toEnvelope();

    expect(serialized).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'title', message: 'Title is required' }],
      },
    });
  });

  it('should instantiate BadRequestError with 400 status and default code', () => {
    const error = new BadRequestError('Invalid query params');

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Invalid query params');
    expect(error.details).toEqual([]);
    expect(error.isOperational).toBe(true);
  });

  it('should instantiate UnauthorizedError with 401 status and default code', () => {
    const error = new UnauthorizedError('Token expired', 'TOKEN_EXPIRED');

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(error.message).toBe('Token expired');
    expect(error.details).toEqual([]);
    expect(error.isOperational).toBe(true);
  });

  it('should instantiate ForbiddenError with 403 status and default code', () => {
    const error = new ForbiddenError('Only project owner can delete');

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.message).toBe('Only project owner can delete');
    expect(error.details).toEqual([]);
    expect(error.isOperational).toBe(true);
  });

  it('should instantiate NotFoundError with 404 status and default code', () => {
    const error = new NotFoundError('Project not found');

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Project not found');
    expect(error.details).toEqual([]);
    expect(error.isOperational).toBe(true);
  });

  it('should instantiate ConflictError with 409 status and default code', () => {
    const error = new ConflictError('Email already registered');

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('Email already registered');
    expect(error.details).toEqual([]);
    expect(error.isOperational).toBe(true);
  });

  it('should instantiate ValidationError with 422 status and field details', () => {
    const fieldDetails = [{ field: 'email', message: 'Invalid email address' }];
    const error = new ValidationError('Validation failed', fieldDetails);

    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Validation failed');
    expect(error.details).toEqual(fieldDetails);
    expect(error.isOperational).toBe(true);
  });

  it('should instantiate InternalServerError with 500 status and non-operational flag', () => {
    const error = new InternalServerError();

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.message).toBe('An unexpected internal server error occurred');
    expect(error.details).toEqual([]);
    expect(error.isOperational).toBe(false);
  });
});

describe('Global Error Handling Middleware (Integration Tests)', () => {
  it('should return 404 with standard envelope for undefined routes', async () => {
    const response = await request(app).get('/api/v1/non-existent-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route GET /api/v1/non-existent-route not found',
        details: [],
      },
    });
  });

  it('should return 400 Bad Request with unified error envelope on malformed JSON payload', async () => {
    const response = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"bad_json: missing_brace');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload in request body',
        details: [],
      },
    });
  });

  describe('Exception Handling in Express Route Pipeline', () => {
    const testApp = express();
    testApp.use(express.json());

    // Test routes throwing various errors
    testApp.get('/test/bad-request', () => {
      throw new BadRequestError('Invalid query parameters provided');
    });

    testApp.get('/test/unauthorized', () => {
      throw new UnauthorizedError('Missing authentication token');
    });

    testApp.get('/test/forbidden', () => {
      throw new ForbiddenError('You do not have access to this resource');
    });

    testApp.get('/test/not-found', () => {
      throw new NotFoundError('Task with id 123 not found');
    });

    testApp.get('/test/conflict', () => {
      throw new ConflictError('A project with this name already exists');
    });

    testApp.post(
      '/test/zod-validation',
      asyncHandler(async (req: Request, res: Response) => {
        const testSchema = z.object({
          email: z.string().email(),
          age: z.number().min(18),
        });
        const validated = testSchema.parse(req.body);
        res.status(200).json(validated);
      })
    );

    testApp.get(
      '/test/async-error',
      asyncHandler(async () => {
        throw new BadRequestError('Async error handled properly');
      })
    );

    testApp.get('/test/uncaught-error', () => {
      throw new Error('Database connection suddenly dropped');
    });

    testApp.use(notFoundHandler);
    testApp.use(errorHandler);

    it('should handle BadRequestError (400) correctly', async () => {
      const response = await request(testApp).get('/test/bad-request');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid query parameters provided',
          details: [],
        },
      });
    });

    it('should handle UnauthorizedError (401) correctly', async () => {
      const response = await request(testApp).get('/test/unauthorized');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing authentication token',
          details: [],
        },
      });
    });

    it('should handle ForbiddenError (403) correctly', async () => {
      const response = await request(testApp).get('/test/forbidden');

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this resource',
          details: [],
        },
      });
    });

    it('should handle NotFoundError (404) correctly', async () => {
      const response = await request(testApp).get('/test/not-found');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Task with id 123 not found',
          details: [],
        },
      });
    });

    it('should handle ConflictError (409) correctly', async () => {
      const response = await request(testApp).get('/test/conflict');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: 'CONFLICT',
          message: 'A project with this name already exists',
          details: [],
        },
      });
    });

    it('should catch Zod validation errors and serialize into 422 with field details', async () => {
      const response = await request(testApp)
        .post('/test/zod-validation')
        .send({ email: 'invalid-email', age: 15 });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toBe('Validation failed');
      expect(Array.isArray(response.body.error.details)).toBe(true);
      expect(response.body.error.details.length).toBe(2);

      const emailIssue = response.body.error.details.find((d: any) => d.field === 'email');
      const ageIssue = response.body.error.details.find((d: any) => d.field === 'age');

      expect(emailIssue).toBeDefined();
      expect(ageIssue).toBeDefined();
    });

    it('should catch async rejections via asyncHandler and forward to errorHandler', async () => {
      const response = await request(testApp).get('/test/async-error');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Async error handled properly');
    });

    it('should catch uncaught 500 errors and respond with safe sanitized internal error envelope', async () => {
      const response = await request(testApp).get('/test/uncaught-error');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected internal server error occurred',
          details: [],
        },
      });
    });
  });
});
