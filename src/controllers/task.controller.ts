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

  /**
   * Handles partial task update (PATCH /tasks/:taskId)
   * Accessible to project members/owner.
   * Responds with 200 OK and updated task details.
   */
  update = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication token is required', 'UNAUTHORIZED');
    }

    const taskId = String(req.params.taskId);
    const task = await this.taskService.updateTask(user.id, taskId, req.body);

    res.status(200).json({
      message: 'Task updated successfully',
      task,
    });
  });

  /**
   * Handles task deletion (DELETE /tasks/:taskId)
   * Restricted strictly to the project owner OR the task creator.
   * Responds with 200 OK.
   */
  delete = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication token is required', 'UNAUTHORIZED');
    }

    const taskId = String(req.params.taskId);
    await this.taskService.deleteTask(user.id, taskId);

    res.status(200).json({
      message: 'Task deleted successfully',
      taskId,
    });
  });

  /**
   * Handles listing project tasks with pagination and dynamic sorting (GET /projects/:projectId/tasks)
   * Accessible only to project members and owner.
   * Responds with 200 OK, tasks array, and pagination metadata (total, page, limit, totalPages).
   */
  listByProject = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication token is required', 'UNAUTHORIZED');
    }

    const projectId = String(req.params.projectId);
    const query = req.query as any;

    const result = await this.taskService.getProjectTasks(user.id, projectId, {
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      order: query.order,
      status: query.status,
      priority: query.priority,
      assigneeId: query.assigneeId,
      dueDateFrom: query.dueDateFrom,
      dueDateTo: query.dueDateTo,
    });

    res.status(200).json({
      tasks: result.tasks,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  });
}
