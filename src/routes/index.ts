import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { projectRouter } from './project.routes.js';
import { taskRouter } from './task.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/projects', projectRouter);
apiRouter.use('/tasks', taskRouter);

export * from './auth.routes.js';
export * from './project.routes.js';
export * from './task.routes.js';

