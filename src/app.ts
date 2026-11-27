import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocument } from './docs/swagger.js';
import { notFoundHandler, errorHandler } from './middlewares/index.js';
import { authRouter, projectRouter, taskRouter } from './routes/index.js';

export const createApp = (): Application => {
  const app = express();

  // Standard middleware
  app.use(cors());
  app.use(express.json());

  // Interactive Swagger UI & OpenAPI JSON endpoints
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.get(['/api-docs.json', '/api/docs.json', '/openapi.json'], (_req: Request, res: Response) => {
    res.status(200).json(swaggerDocument);
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'taskflow-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  // Authentication routes
  app.use('/auth', authRouter);
  app.use('/api/v1/auth', authRouter);

  // Project routes
  app.use('/projects', projectRouter);
  app.use('/api/v1/projects', projectRouter);

  // Task routes
  app.use('/tasks', taskRouter);
  app.use('/api/v1/tasks', taskRouter);

  // Catch unmatched routes (404 Not Found)
  app.use(notFoundHandler);

  // Global centralized error handling middleware
  app.use(errorHandler);

  return app;
};

export const app = createApp();
