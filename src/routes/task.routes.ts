import { Router } from 'express';
import { TaskController } from '../controllers/task.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.js';
import { taskIdParamSchema, updateTaskSchema } from '../schemas/task.schema.js';

export const createTaskRouter = (
  taskController: TaskController = new TaskController(),
  authMiddleware = authenticate
): Router => {
  const router = Router();

  // All task endpoints require authentication
  router.use(authMiddleware);

  /**
   * @route PATCH /tasks/:taskId
   * @desc Partially update task fields with completed_at lifecycle tracking (members only)
   * @access Protected (Members only)
   */
  router.patch(
    '/:taskId',
    validate({ params: taskIdParamSchema, body: updateTaskSchema }),
    taskController.update
  );

  return router;
};

export const taskRouter = createTaskRouter();

