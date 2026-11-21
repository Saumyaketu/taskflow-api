import { SafeUser } from '../services/auth.service.js';

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      currentUser?: SafeUser;
      current_user?: SafeUser;
    }
  }
}

export {};
