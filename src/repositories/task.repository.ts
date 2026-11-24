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
}
