import { Project } from '@prisma/client';
import { ProjectRepository, ProjectWithMembers } from '../repositories/project.repository.js';
import { CreateProjectInput } from '../schemas/project.schema.js';

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
}
