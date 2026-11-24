import { PrismaClient, Task, Priority, TaskStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../config/database.js';

export interface CreateTaskRepoData {
  projectId: string;
  creatorId: string;
  title: string;
  description?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  assigneeId?: string | null;
  dueDate?: Date | null;
  completedAt?: Date | null;
}

export interface UpdateTaskRepoData {
  title?: string;
  description?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  assigneeId?: string | null;
  dueDate?: Date | null;
  completedAt?: Date | null;
}

export type TaskWithDetails = Task & {
  creator: {
    id: string;
    name: string;
    email: string;
  };
  assignee: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export interface FindProjectTasksOptions {
  projectId: string;
  page: number;
  limit: number;
  sortBy?: 'createdAt' | 'dueDate';
  order?: 'asc' | 'desc';
  status?: TaskStatus[];
  priority?: Priority[];
  assigneeId?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
}

export interface PaginatedTasksResult {
  tasks: TaskWithDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}


export class TaskRepository {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /**
   * Creates a new task in the database associated with a project and creator.
   */
  async create(data: CreateTaskRepoData): Promise<TaskWithDetails> {
    return this.db.task.create({
      data: {
        projectId: data.projectId,
        creatorId: data.creatorId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority ?? Priority.MEDIUM,
        status: data.status ?? TaskStatus.TODO,
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ?? null,
        completedAt: data.completedAt ?? null,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Retrieves a task by unique ID with creator and assignee associations.
   */
  async findById(taskId: string): Promise<TaskWithDetails | null> {
    try {
      return await this.db.task.findUnique({
        where: { id: taskId },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2023' || err?.message?.includes('invalid input syntax for type uuid')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Updates an existing task by ID with partial fields.
   */
  async update(taskId: string, data: UpdateTaskRepoData): Promise<TaskWithDetails> {
    const updatePayload: Record<string, any> = {};

    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.priority !== undefined) updatePayload.priority = data.priority;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.assigneeId !== undefined) updatePayload.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) updatePayload.dueDate = data.dueDate;
    if (data.completedAt !== undefined) updatePayload.completedAt = data.completedAt;

    return this.db.task.update({
      where: { id: taskId },
      data: updatePayload,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Deletes a task by unique ID.
   */
  async delete(taskId: string): Promise<Task> {
    return this.db.task.delete({
      where: { id: taskId },
    });
  }

  /**
   * Retrieves a paginated, sorted, and filtered list of tasks for a given project.
   */
  async findProjectTasks(options: FindProjectTasksOptions): Promise<PaginatedTasksResult> {
    const { projectId, page, limit, sortBy = 'createdAt', order = 'asc' } = options;
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Record<string, any> = { projectId };

    if (options.status && options.status.length > 0) {
      where.status = { in: options.status };
    }

    if (options.priority && options.priority.length > 0) {
      where.priority = { in: options.priority };
    }

    if (options.assigneeId) {
      where.assigneeId = options.assigneeId;
    }

    if (options.dueDateFrom || options.dueDateTo) {
      where.dueDate = {
        ...(options.dueDateFrom ? { gte: options.dueDateFrom } : {}),
        ...(options.dueDateTo ? { lte: options.dueDateTo } : {}),
      };
    }

    const [total, tasks] = await Promise.all([
      this.db.task.count({
        where,
      }),
      this.db.task.findMany({
        where,
        skip,
        take,
        orderBy: [
          { [sortBy]: order },
          { id: 'asc' },
        ],
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      tasks,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
