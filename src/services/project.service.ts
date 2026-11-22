import { Project } from '@prisma/client';
import {
  ProjectRepository,
  ProjectWithMembers,
  ProjectWithOwnerAndMembers,
  ProjectMemberWithUser,
} from '../repositories/project.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { CreateProjectInput, AddMemberInput } from '../schemas/project.schema.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../errors/AppError.js';

export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly userRepository: UserRepository = new UserRepository()
  ) {}

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

  /**
   * Adds an existing registered user to a project by email.
   * Only the project owner may add members.
   * Throws 404 Not Found if project does not exist.
   * Throws 403 Forbidden if user is not the project owner.
   * Throws 404 Not Found if target user does not exist.
   * Throws 409 Conflict if target user is already a member of the project.
   */
  async addMember(
    requestingUserId: string,
    projectId: string,
    input: AddMemberInput
  ): Promise<ProjectMemberWithUser> {
    // 1. Verify project exists
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }

    // 2. Strict owner authorization check
    if (project.ownerId !== requestingUserId) {
      throw new ForbiddenError('Only the project owner can add members', 'FORBIDDEN');
    }

    // 3. Lookup target user by normalized email
    const normalizedEmail = input.email.trim().toLowerCase();
    const targetUser = await this.userRepository.findByEmail(normalizedEmail);
    if (!targetUser) {
      throw new NotFoundError('User with this email does not exist', 'USER_NOT_FOUND');
    }

    // 4. Check if target user is already a member
    const isAlreadyMember = await this.projectRepository.isMember(projectId, targetUser.id);
    if (isAlreadyMember) {
      throw new ConflictError('User is already a member of this project', 'MEMBER_ALREADY_EXISTS');
    }

    // 5. Add user to project members
    return this.projectRepository.addMember(projectId, targetUser.id);
  }
}
