import express, { Application, Request, Response } from 'express';
import cors from 'cors';

export const createApp = (): Application => {
  const app = express();

  // Standard middleware
  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'taskflow-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  return app;
};

export const app = createApp();
