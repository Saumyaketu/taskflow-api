import { Router } from 'express';
import { TaskController } from '../controllers/task.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

export const createTaskRouter = (
  taskController: TaskController = new TaskController(),
  authMiddleware = authenticate
): Router => {
  const router = Router();

  // All task endpoints require authentication
  router.use(authMiddleware);

  return router;
};

export const taskRouter = createTaskRouter();
