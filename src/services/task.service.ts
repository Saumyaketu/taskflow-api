import { TaskStatus } from '@prisma/client';
import { TaskRepository, TaskWithDetails } from '../repositories/task.repository.js';
import { ProjectRepository } from '../repositories/project.repository.js';
import { CreateTaskInput } from '../schemas/task.schema.js';
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
}
