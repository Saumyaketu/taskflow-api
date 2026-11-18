import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.js';
import { registerSchema } from '../schemas/auth.schema.js';

export const createAuthRouter = (authController: AuthController = new AuthController()): Router => {
  const router = Router();

  /**
   * @route POST /auth/register
   * @desc Register a new user with validation and password hashing
   * @access Public
   */
  router.post('/register', validate(registerSchema), authController.register);

  return router;
};

export const authRouter = createAuthRouter();
