import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';

export const createAuthRouter = (
  authController: AuthController = new AuthController(),
  authMiddleware = authenticate
): Router => {
  const router = Router();

  /**
   * @route POST /auth/register
   * @desc Register a new user with validation and password hashing
   * @access Public
   */
  router.post('/register', validate(registerSchema), authController.register);

  /**
   * @route POST /auth/login
   * @desc Authenticate user and issue signed JWT token
   * @access Public
   */
  router.post('/login', validate(loginSchema), authController.login);

  /**
   * @route GET /auth/me
   * @desc Retrieve profile of currently authenticated user
   * @access Protected (Requires Bearer JWT)
   */
  router.get('/me', authMiddleware, authController.me);

  return router;
};

export const authRouter = createAuthRouter();
