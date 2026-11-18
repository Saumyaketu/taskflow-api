import { PrismaClient, User } from '@prisma/client';
import { prisma as defaultPrisma } from '../config/database.js';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
}

export class UserRepository {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /**
   * Finds a user by email address (case-insensitive)
   */
  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.db.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Finds a user by unique identifier (UUID)
   */
  async findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({
      where: { id },
    });
  }

  /**
   * Inserts a newly registered user record
   */
  async create(data: CreateUserData): Promise<User> {
    return this.db.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash: data.passwordHash,
      },
    });
  }
}
