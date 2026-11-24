import { Request, Response } from 'express';
import { TaskService } from '../services/task.service.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { UnauthorizedError } from '../errors/AppError.js';

export class TaskController {
  constructor(private readonly taskService: TaskService = new TaskService()) {}

  /**
   * Handles task creation under a project (POST /projects/:projectId/tasks)
   * Responds with 201 Created and the newly created task details.
   */
  create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication token is required', 'UNAUTHORIZED');
    }

    const projectId = String(req.params.projectId);
    const task = await this.taskService.createTask(user.id, projectId, req.body);

    res.status(201).json({
      message: 'Task created successfully',
      task,
    });
  });
}
