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

export type ProjectMemberWithUser = {
  id: string;
  projectId: string;
  userId: string;
  joinedAt: Date;
  user?: {
    id: string;
    name: string;
    email: string;
  };
};

export type ProjectWithOwnerAndMembers = Project & {
  owner: {
    id: string;
    name: string;
    email: string;
  };
  members: ProjectMemberWithUser[];
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
            projectId: true,
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
  async findById(projectId: string): Promise<ProjectWithOwnerAndMembers | null> {
    try {
      return (await this.db.project.findUnique({
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
              projectId: true,
              userId: true,
              joinedAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: {
              joinedAt: 'asc',
            },
          },
        },
      })) as ProjectWithOwnerAndMembers | null;
    } catch (err: any) {
      // If UUID syntax is invalid in PostgreSQL driver, treat as not found
      if (err?.code === 'P2023' || err?.message?.includes('invalid input syntax for type uuid')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Deletes a project by ID.
   * Cascading foreign key constraints (onDelete: Cascade) automatically delete associated project members and tasks.
   */
  async delete(projectId: string): Promise<Project> {
    return this.db.project.delete({
      where: { id: projectId },
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

  /**
   * Adds a user as a member to a project.
   */
  async addMember(projectId: string, userId: string): Promise<ProjectMemberWithUser> {
    const member = await this.db.projectMember.create({
      data: {
        projectId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return member;
  }
}
