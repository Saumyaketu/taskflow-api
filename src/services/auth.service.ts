import { User } from '@prisma/client';
import { UserRepository } from '../repositories/user.repository.js';
import { RegisterInput } from '../schemas/auth.schema.js';
import { hashPassword } from '../utils/password.js';
import { ConflictError } from '../errors/index.js';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
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
}
