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

  /**
   * @route DELETE /tasks/:taskId
   * @desc Delete task (restricted strictly to project owner OR task creator)
   * @access Protected (Owner or Task Creator only)
   */
  router.delete(
    '/:taskId',
    validate({ params: taskIdParamSchema }),
    taskController.delete
  );

  return router;
};

export const taskRouter = createTaskRouter();

