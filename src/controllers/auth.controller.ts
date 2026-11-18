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
}
