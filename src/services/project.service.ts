import { Project } from '@prisma/client';
import {
  ProjectRepository,
  ProjectWithMembers,
  ProjectWithOwnerAndMembers,
} from '../repositories/project.repository.js';
import { CreateProjectInput } from '../schemas/project.schema.js';
import { NotFoundError, ForbiddenError } from '../errors/AppError.js';

export class ProjectService {
  constructor(private readonly projectRepository: ProjectRepository = new ProjectRepository()) {}

  /**
   * Creates a new project and associates the creator as both the owner and first member in a single transaction.
   */
  async createProject(userId: string, input: CreateProjectInput): Promise<ProjectWithMembers> {
    return this.projectRepository.createWithMembership({
      name: input.name,
      description: input.description,
      ownerId: userId,
    });
  }

  /**
   * Retrieves all projects where the given user is a member.
   */
  async getUserProjects(userId: string): Promise<Project[]> {
    return this.projectRepository.findByUserId(userId);
  }

  /**
   * Retrieves single project details if the requesting user is a project member or owner.
   * Throws 404 Not Found if project does not exist.
   * Throws 403 Forbidden if user is not a project member.
   */
  async getProjectById(userId: string, projectId: string): Promise<ProjectWithOwnerAndMembers> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }

    const isMember = project.members.some((m) => m.userId === userId) || project.ownerId === userId;
    if (!isMember) {
      throw new ForbiddenError('You do not have access to this project', 'FORBIDDEN');
    }

    return project;
  }

  /**
   * Deletes a project if the requesting user is the project owner.
   * Throws 404 Not Found if project does not exist.
   * Throws 403 Forbidden if user is not the project owner.
   * Cascading database constraints automatically remove associated memberships and tasks.
   */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenError('Only the project owner can delete this project', 'FORBIDDEN');
    }

    await this.projectRepository.delete(projectId);
  }
}
