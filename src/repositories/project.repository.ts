import { PrismaClient, Project, ProjectMember } from '@prisma/client';
import { prisma as defaultPrisma } from '../config/database.js';

export interface CreateProjectData {
  name: string;
  description?: string | null;
  ownerId: string;
}

export type ProjectWithMembers = Project & {
  members: ProjectMember[];
};

export class ProjectRepository {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /**
   * Creates a project and inserts the creator as the owner and first member in a single atomic transaction.
   */
  async createWithMembership(data: CreateProjectData): Promise<ProjectWithMembers> {
    return this.db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          ownerId: data.ownerId,
        },
      });

      const member = await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: data.ownerId,
        },
      });

      return {
        ...project,
        members: [member],
      };
    });
  }

  /**
   * Retrieves all projects where the specified user is a member.
   */
  async findByUserId(userId: string): Promise<Project[]> {
    return this.db.project.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          select: {
            id: true,
            userId: true,
            joinedAt: true,
          },
          orderBy: {
            joinedAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Finds a project by its unique ID with owner and members.
   */
  async findById(projectId: string): Promise<Project | null> {
    return this.db.project.findUnique({
      where: { id: projectId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          select: {
            id: true,
            userId: true,
            joinedAt: true,
          },
          orderBy: {
            joinedAt: 'asc',
          },
        },
      },
    });
  }

  /**
   * Verifies if a user is a member of the project.
   */
  async isMember(projectId: string, userId: string): Promise<boolean> {
    const membership = await this.db.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
    return membership !== null;
  }
}
