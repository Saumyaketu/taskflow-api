import { Request, Response, NextFunction } from 'express';
import { verifyToken, DecodedToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../errors/AppError.js';
import { UserRepository } from '../repositories/user.repository.js';
import { toSafeUser, SafeUser } from '../services/auth.service.js';

// Augment Express Request interface for TypeScript type safety
declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      currentUser?: SafeUser;
      current_user?: SafeUser;
    }
  }
}

/**
 * Creates an authentication guard middleware instance with customizable/injected dependencies.
 */
export const createAuthMiddleware = (userRepository: UserRepository = new UserRepository()) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Extract Authorization header
      const rawHeader = req.get('authorization') || req.headers.authorization;
      const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

      if (!authHeader) {
        throw new UnauthorizedError('Authentication token is required', 'UNAUTHORIZED');
      }

      // 2. Validate Bearer scheme format
      const parts = authHeader.trim().split(/\s+/);
      if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
        throw new UnauthorizedError(
          'Authorization header must follow the format: Bearer <token>',
          'UNAUTHORIZED'
        );
      }

      const token = parts[1];

      // 3. Verify JWT token signature and expiration claims
      let decoded: DecodedToken;
      try {
        decoded = verifyToken(token);
      } catch (err: any) {
        if (err?.name === 'TokenExpiredError') {
          throw new UnauthorizedError('Authentication token has expired', 'TOKEN_EXPIRED');
        }
        throw new UnauthorizedError('Invalid or malformed authentication token', 'INVALID_TOKEN');
      }

      // 4. Confirm user identity exists in the database
      const user = await userRepository.findById(decoded.userId);
      if (!user) {
        throw new UnauthorizedError('User belonging to this token no longer exists', 'USER_NOT_FOUND');
      }

      // 5. Inject sanitized user context into request
      const safeUser = toSafeUser(user);
      req.user = safeUser;
      req.currentUser = safeUser;
      req.current_user = safeUser;

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Default authentication guard middleware singleton
 */
export const authenticate = createAuthMiddleware();

/**
 * Descriptive alias for authenticate middleware
 */
export const authGuard = authenticate;
