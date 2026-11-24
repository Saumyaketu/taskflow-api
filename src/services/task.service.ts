import { TaskStatus } from '@prisma/client';
import { TaskRepository, TaskWithDetails, PaginatedTasksResult } from '../repositories/task.repository.js';
import { ProjectRepository } from '../repositories/project.repository.js';
import { CreateTaskInput, UpdateTaskInput } from '../schemas/task.schema.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors/AppError.js';

export class TaskService {
  constructor(
    private readonly taskRepository: TaskRepository = new TaskRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository()
  ) {}

  /**
   * Creates a new task in a project.
   *
   * Business Rules:
   * 1. Project must exist (404 Not Found if missing).
   * 2. Creator must be an active member or owner of the project (403 Forbidden if non-member).
   * 3. If an assignee is specified, the assignee must be a member of the project (400 Bad Request if not a member).
   * 4. If status is DONE upon creation, completedAt timestamp is automatically populated.
   */
  async createTask(
    creatorUserId: string,
    projectId: string,
    input: CreateTaskInput
  ): Promise<TaskWithDetails> {
    // 1. Verify project existence
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }

    // 2. Verify creator authorization (must be project member or owner)
    const isCreatorMember =
      project.ownerId === creatorUserId ||
      project.members.some((member) => member.userId === creatorUserId);

    if (!isCreatorMember) {
      throw new ForbiddenError('You do not have access to create tasks in this project', 'FORBIDDEN');
    }

    // 3. Verify assignee membership if an assignee is provided
    if (input.assigneeId) {
      const isAssigneeMember =
        project.ownerId === input.assigneeId ||
        project.members.some((member) => member.userId === input.assigneeId);

      if (!isAssigneeMember) {
        throw new BadRequestError(
          'Assignee must be a member of the project',
          'INVALID_ASSIGNEE'
        );
      }
    }

    // 4. Determine completedAt if status is DONE
    const completedAt = input.status === TaskStatus.DONE ? new Date() : null;

    // 5. Persist and return created task
    return this.taskRepository.create({
      projectId,
      creatorId: creatorUserId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: input.status,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate,
      completedAt,
    });
  }

  /**
   * Partially updates an existing task.
   *
   * Business Rules:
   * 1. Task must exist (404 Not Found if missing).
   * 2. Caller must be an active member or owner of the task's project (403 Forbidden if non-member).
   * 3. If an assignee is updated to a non-null user, the assignee must be a member of the project (400 Bad Request).
   * 4. Lifecycle rule: If status changes to DONE, set completedAt = now(). If reopened (TODO / IN_PROGRESS), clear completedAt = null.
   * 5. Automatically maintains updatedAt timestamp.
   */
  async updateTask(
    userId: string,
    taskId: string,
    input: UpdateTaskInput
  ): Promise<TaskWithDetails> {
    // 1. Verify task existence
    const existingTask = await this.taskRepository.findById(taskId);
    if (!existingTask) {
      throw new NotFoundError('Task not found', 'TASK_NOT_FOUND');
    }

    // 2. Verify project existence and caller authorization
    const project = await this.projectRepository.findById(existingTask.projectId);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }

    const isMember =
      project.ownerId === userId ||
      project.members.some((member) => member.userId === userId);

    if (!isMember) {
      throw new ForbiddenError('You do not have access to modify tasks in this project', 'FORBIDDEN');
    }

    // 3. Verify assignee membership if assignee is being assigned/updated
    if (input.assigneeId) {
      const isAssigneeMember =
        project.ownerId === input.assigneeId ||
        project.members.some((member) => member.userId === input.assigneeId);

      if (!isAssigneeMember) {
        throw new BadRequestError(
          'Assignee must be a member of the project',
          'INVALID_ASSIGNEE'
        );
      }
    }

    // 4. Dynamic completion lifecycle
    let completedAt: Date | null | undefined = undefined;
    if (input.status !== undefined) {
      if (input.status === TaskStatus.DONE) {
        completedAt = existingTask.status === TaskStatus.DONE
          ? existingTask.completedAt ?? new Date()
          : new Date();
      } else {
        completedAt = null;
      }
    }

    // 5. Update task
    return this.taskRepository.update(taskId, {
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: input.status,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate,
      completedAt,
    });
  }

  /**
   * Deletes a task by ID with dual creator-or-owner authorization.
   *
   * Business Rules:
   * 1. Task must exist (404 Not Found if missing).
   * 2. Project must exist (404 Not Found if missing).
   * 3. Authorization constraint: Only the project owner OR the task creator can delete the task.
   *    Non-authorized members or outsiders receive 403 Forbidden.
   */
  async deleteTask(userId: string, taskId: string): Promise<void> {
    // 1. Verify task existence
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new NotFoundError('Task not found', 'TASK_NOT_FOUND');
    }

    // 2. Verify project existence
    const project = await this.projectRepository.findById(task.projectId);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }

    // 3. Strict dual creator-or-owner check
    const isOwner = project.ownerId === userId;
    const isCreator = task.creatorId === userId;

    if (!isOwner && !isCreator) {
      throw new ForbiddenError(
        'Only the project owner or the task creator can delete this task',
        'FORBIDDEN'
      );
    }

    // 4. Delete task
    await this.taskRepository.delete(taskId);
  }

  /**
   * Retrieves a paginated and sorted list of tasks for a project.
   *
   * Business Rules:
   * 1. Project must exist (404 Not Found if missing).
   * 2. Requester must be a member or owner of the project (403 Forbidden if non-member).
   * 3. Returns tasks along with pagination metadata: total, page, limit, totalPages.
   */
  async getProjectTasks(
    userId: string,
    projectId: string,
    options: {
      page: number;
      limit: number;
      sortBy?: 'createdAt' | 'dueDate';
      order?: 'asc' | 'desc';
    }
  ): Promise<PaginatedTasksResult> {
    // 1. Verify project existence
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }

    // 2. Verify caller authorization (must be project member or owner)
    const isMember =
      project.ownerId === userId ||
      project.members.some((member) => member.userId === userId);

    if (!isMember) {
      throw new ForbiddenError(
        'You do not have access to view tasks in this project',
        'FORBIDDEN'
      );
    }

    // 3. Delegate to repository
    return this.taskRepository.findProjectTasks({
      projectId,
      page: options.page,
      limit: options.limit,
      sortBy: options.sortBy,
      order: options.order,
    });
  }
}
