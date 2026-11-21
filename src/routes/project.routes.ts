import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller.js';
import { validate } from '../middlewares/validate.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { createProjectSchema } from '../schemas/project.schema.js';

export const createProjectRouter = (
  projectController: ProjectController = new ProjectController(),
  authMiddleware = authenticate
): Router => {
  const router = Router();

  // All project endpoints require authentication
  router.use(authMiddleware);

  /**
   * @route POST /projects
   * @desc Create a new project and assign creator as owner and first member
   * @access Protected
   */
  router.post('/', validate(createProjectSchema), projectController.create);

  /**
   * @route GET /projects
   * @desc List all projects where current authenticated user is a member
   * @access Protected
   */
  router.get('/', projectController.list);

  return router;
};

export const projectRouter = createProjectRouter();
