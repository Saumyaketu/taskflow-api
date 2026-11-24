import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller.js';
import { TaskController } from '../controllers/task.controller.js';
import { validate } from '../middlewares/validate.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  createProjectSchema,
  projectIdParamSchema,
  addMemberSchema,
} from '../schemas/project.schema.js';
import { createTaskSchema, listTasksQuerySchema } from '../schemas/task.schema.js';

export const createProjectRouter = (
  projectController: ProjectController = new ProjectController(),
  taskController: TaskController = new TaskController(),
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

  /**
   * @route GET /projects/:projectId
   * @desc View single project details (members only)
   * @access Protected (Members only)
   */
  router.get('/:projectId', validate({ params: projectIdParamSchema }), projectController.getById);

  /**
   * @route DELETE /projects/:projectId
   * @desc Delete project and cascade remove tasks and memberships (owner only)
   * @access Protected (Owner only)
   */
  router.delete('/:projectId', validate({ params: projectIdParamSchema }), projectController.delete);

  /**
   * @route POST /projects/:projectId/members
   * @desc Add a registered user as a member to the project by email (owner only)
   * @access Protected (Owner only)
   */
  router.post(
    '/:projectId/members',
    validate({ params: projectIdParamSchema, body: addMemberSchema }),
    projectController.addMember
  );

  /**
   * @route POST /projects/:projectId/tasks
   * @desc Create a new task within a project (members only)
   * @access Protected (Members only)
   */
  router.post(
    '/:projectId/tasks',
    validate({ params: projectIdParamSchema, body: createTaskSchema }),
    taskController.create
  );

  /**
   * @route GET /projects/:projectId/tasks
   * @desc List project tasks with cursor/offset pagination and dynamic sorting (members only)
   * @access Protected (Members only)
   */
  router.get(
    '/:projectId/tasks',
    validate({ params: projectIdParamSchema, query: listTasksQuerySchema }),
    taskController.listByProject
  );

  return router;
};

export const projectRouter = createProjectRouter();
