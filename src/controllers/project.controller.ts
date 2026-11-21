import { Request, Response } from 'express';
import { ProjectService } from '../services/project.service.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { UnauthorizedError } from '../errors/AppError.js';

export class ProjectController {
  constructor(private readonly projectService: ProjectService = new ProjectService()) {}

  /**
   * Handles project creation (POST /projects)
   * Responds with 201 Created and project details including creator membership
   */
  create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication token is required', 'UNAUTHORIZED');
    }

    const project = await this.projectService.createProject(user.id, req.body);

    res.status(201).json({
      message: 'Project created successfully',
      project,
    });
  });

  /**
   * Handles listing projects available to the authenticated user (GET /projects)
   * Responds with 200 OK and array of projects where user is a member
   */
  list = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication token is required', 'UNAUTHORIZED');
    }

    const projects = await this.projectService.getUserProjects(user.id);

    res.status(200).json({
      projects,
    });
  });
}
