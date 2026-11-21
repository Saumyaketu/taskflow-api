import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

export class AuthController {
  constructor(private readonly authService: AuthService = new AuthService()) {}

  /**
   * Handles user registration (POST /auth/register)
   * Responds with 201 Created and sanitized user profile
   */
  register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = await this.authService.register(req.body);

    res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  });

  /**
   * Handles user login (POST /auth/login)
   * Responds with 200 OK, signed JWT token, and sanitized user profile
   */
  login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token, user } = await this.authService.login(req.body);

    res.status(200).json({
      message: 'Login successful',
      token,
      user,
    });
  });

  /**
   * Handles retrieving current authenticated user (GET /auth/me)
   * Responds with 200 OK and sanitized user profile from request context
   */
  me = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      message: 'Current user profile retrieved successfully',
      user: req.user,
    });
  });
}
