import { User } from '@prisma/client';
import { UserRepository } from '../repositories/user.repository.js';
import { RegisterInput, LoginInput } from '../schemas/auth.schema.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { ConflictError, UnauthorizedError } from '../errors/index.js';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResult {
  token: string;
  user: SafeUser;
}

/**
 * Strips sensitive authentication fields (e.g., password_hash) from the user model
 */
export const toSafeUser = (user: User): SafeUser => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export class AuthService {
  constructor(private readonly userRepository: UserRepository = new UserRepository()) {}

  /**
   * Registers a new user with case-insensitive email deduplication and secure bcrypt hashing
   */
  async register(input: RegisterInput): Promise<SafeUser> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Case-insensitive email uniqueness check
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictError('A user with this email address already exists', 'EMAIL_ALREADY_EXISTS');
    }

    // 2. Hash plaintext password with bcrypt
    const passwordHash = await hashPassword(input.password);

    // 3. Persist new user in database
    const newUser = await this.userRepository.create({
      name: input.name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    // 4. Return safe representation without sensitive credentials
    return toSafeUser(newUser);
  }

  /**
   * Authenticates a user with email and password, issuing a signed JWT.
   * Employs generic 401 Unauthorized responses to prevent user enumeration attacks.
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Look up user by normalized email
    const user = await this.userRepository.findByEmail(normalizedEmail);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // 2. Verify password against stored bcrypt hash
    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // 3. Issue signed JWT token containing user identity and expiration claims
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // 4. Return token and sanitized user profile
    return {
      token,
      user: toSafeUser(user),
    };
  }
}
