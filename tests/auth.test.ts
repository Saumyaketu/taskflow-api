import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { hashPassword, comparePassword } from '../src/utils/password.js';
import { registerSchema } from '../src/schemas/auth.schema.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { AuthService, toSafeUser } from '../src/services/auth.service.js';
import { ConflictError } from '../src/errors/index.js';

describe('User Registration Endpoint & Security Pipeline', () => {
  // =========================================================================
  // 1. Password Hashing & Verification Utilities
  // =========================================================================
  describe('Password Hashing Utilities', () => {
    it('should securely hash password with bcrypt and salt rounds', async () => {
      const plaintext = 'SecurePass123!';
      const hash = await hashPassword(plaintext);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(plaintext);
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/); // standard bcrypt prefix

      const isMatch = await comparePassword(plaintext, hash);
      expect(isMatch).toBe(true);

      const isMismatch = await comparePassword('WrongPassword', hash);
      expect(isMismatch).toBe(false);
    });
  });

  // =========================================================================
  // 2. Input Validation Schema & Normalization
  // =========================================================================
  describe('Registration Zod Schema Validation & Normalization', () => {
    it('should accept valid user payload and normalize email to lowercase and trimmed', () => {
      const rawInput = {
        name: '  Jane Doe  ',
        email: '  Jane.Doe@EXAMPLE.COM  ',
        password: 'ValidPassword123',
      };

      const parsed = registerSchema.parse(rawInput);

      expect(parsed.name).toBe('Jane Doe');
      expect(parsed.email).toBe('jane.doe@example.com');
      expect(parsed.password).toBe('ValidPassword123');
    });

    it('should reject email with invalid format', () => {
      const input = {
        name: 'Jane Doe',
        email: 'not-a-valid-email',
        password: 'ValidPassword123',
      };

      expect(() => registerSchema.parse(input)).toThrow();
    });

    it('should reject password with less than 8 characters', () => {
      const input = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'short',
      };

      expect(() => registerSchema.parse(input)).toThrow();
    });

    it('should reject empty or whitespace-only name', () => {
      const input = {
        name: '   ',
        email: 'jane@example.com',
        password: 'ValidPassword123',
      };

      expect(() => registerSchema.parse(input)).toThrow();
    });
  });

  // =========================================================================
  // 3. Repository Layer (UserRepository)
  // =========================================================================
  describe('UserRepository Unit Tests', () => {
    const mockPrisma = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    } as any;

    const repository = new UserRepository(mockPrisma);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should normalize email before calling findFirst', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await repository.findByEmail('  Alex@GMAIL.COM ');

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: {
            equals: 'alex@gmail.com',
            mode: 'insensitive',
          },
        },
      });
    });

    it('should persist user with normalized email and passwordHash', async () => {
      const mockCreated = {
        id: 'uuid-1234',
        name: 'Alex Smith',
        email: 'alex@gmail.com',
        passwordHash: '$2a$10$hashedstring',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.user.create.mockResolvedValueOnce(mockCreated);

      const result = await repository.create({
        name: ' Alex Smith ',
        email: ' Alex@GMAIL.com ',
        passwordHash: '$2a$10$hashedstring',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          name: 'Alex Smith',
          email: 'alex@gmail.com',
          passwordHash: '$2a$10$hashedstring',
        },
      });
      expect(result).toEqual(mockCreated);
    });

    it('should retrieve user by id', async () => {
      const mockUser = { id: 'uuid-1234', name: 'Alex' };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const result = await repository.findById('uuid-1234');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'uuid-1234' } });
      expect(result).toEqual(mockUser);
    });
  });

  // =========================================================================
  // 4. Service Layer (AuthService)
  // =========================================================================
  describe('AuthService Unit Tests', () => {
    const mockUserRepo = {
      findByEmail: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
    } as unknown as UserRepository;

    const service = new AuthService(mockUserRepo);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should register a new user and never expose passwordHash', async () => {
      vi.spyOn(mockUserRepo, 'findByEmail').mockResolvedValueOnce(null);

      const createdDate = new Date();
      vi.spyOn(mockUserRepo, 'create').mockImplementationOnce(async (data) => ({
        id: 'mock-user-id',
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        createdAt: createdDate,
        updatedAt: createdDate,
      }));

      const safeUser = await service.register({
        name: 'Alice Wonder',
        email: 'alice@example.com',
        password: 'Password123!',
      });

      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('alice@example.com');
      expect(mockUserRepo.create).toHaveBeenCalled();

      // Ensure passwordHash is omitted from returned model
      expect(safeUser).toEqual({
        id: 'mock-user-id',
        name: 'Alice Wonder',
        email: 'alice@example.com',
        createdAt: createdDate,
        updatedAt: createdDate,
      });
      expect((safeUser as any).passwordHash).toBeUndefined();
      expect((safeUser as any).password).toBeUndefined();
    });

    it('should throw ConflictError if email is already registered', async () => {
      vi.spyOn(mockUserRepo, 'findByEmail').mockResolvedValueOnce({
        id: 'existing-id',
        name: 'Existing User',
        email: 'alice@example.com',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.register({
          name: 'Alice Wonder',
          email: 'Alice@Example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow(ConflictError);

      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('toSafeUser helper should explicitly strip password_hash', () => {
      const now = new Date();
      const rawUser = {
        id: 'user-id-99',
        name: 'Bob',
        email: 'bob@example.com',
        passwordHash: '$2a$10$supersecret',
        createdAt: now,
        updatedAt: now,
      };

      const safe = toSafeUser(rawUser);

      expect(safe).toEqual({
        id: 'user-id-99',
        name: 'Bob',
        email: 'bob@example.com',
        createdAt: now,
        updatedAt: now,
      });
      expect((safe as any).passwordHash).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. HTTP Integration Tests (POST /auth/register)
  // =========================================================================
  describe('POST /auth/register HTTP Endpoint', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should successfully register user, return 201 Created and safe user profile without passwordHash', async () => {
      const mockCreatedUser = {
        id: '4f0391ab-3f59-4bb4-9588-4c803df3ea5a',
        name: 'Bruce Wayne',
        email: 'bruce@wayne.com',
        passwordHash: '$2a$10$sampleHashedPassword1234567890',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null);
      const createSpy = vi.spyOn(prisma.user, 'create').mockResolvedValueOnce(mockCreatedUser);

      const response = await request(app)
        .post('/auth/register')
        .send({
          name: 'Bruce Wayne',
          email: '  Bruce@Wayne.COM  ',
          password: 'SuperSecretPassword123',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toEqual({
        id: '4f0391ab-3f59-4bb4-9588-4c803df3ea5a',
        name: 'Bruce Wayne',
        email: 'bruce@wayne.com',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      // Crucial Security Requirement: passwordHash must NEVER be exposed
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(response.body.user.password).toBeUndefined();
      expect(response.body.passwordHash).toBeUndefined();

      // Verify email was normalized and password was hashed
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Bruce Wayne',
            email: 'bruce@wayne.com',
            passwordHash: expect.stringMatching(/^\$2[aby]\$\d{2}\$/),
          }),
        })
      );
    });

    it('should also be accessible via versioned route POST /api/v1/auth/register', async () => {
      const mockCreatedUser = {
        id: '4f0391ab-3f59-4bb4-9588-4c803df3ea5b',
        name: 'Clark Kent',
        email: 'clark@dailyplanet.com',
        passwordHash: '$2a$10$sampleHashedPassword1234567890',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null);
      vi.spyOn(prisma.user, 'create').mockResolvedValueOnce(mockCreatedUser);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Clark Kent',
          email: 'clark@dailyplanet.com',
          password: 'SuperSecretPassword123',
        });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('clark@dailyplanet.com');
    });

    it('should return 409 Conflict with standard error envelope when email is already registered (case-insensitive deduplication)', async () => {
      const existingUser = {
        id: 'existing-uuid',
        name: 'Existing Bruce',
        email: 'bruce@wayne.com',
        passwordHash: '$2a$10$existingHash',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(existingUser);
      const createSpy = vi.spyOn(prisma.user, 'create');

      const response = await request(app)
        .post('/auth/register')
        .send({
          name: 'Bruce Duplicate',
          email: 'BRUCE@WAYNE.COM', // Different casing
          password: 'AnotherPassword123',
        });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'A user with this email address already exists',
          details: [],
        },
      });
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('should return 422 Validation Error when password is less than 8 characters', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          name: 'Diana Prince',
          email: 'diana@themyscira.com',
          password: 'short', // 5 chars, requires >= 8
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toBe('Validation failed');
      expect(Array.isArray(response.body.error.details)).toBe(true);

      const passwordIssue = response.body.error.details.find((d: any) => d.field === 'password');
      expect(passwordIssue).toBeDefined();
      expect(passwordIssue.message).toContain('8 characters');
    });

    it('should return 422 Validation Error when email format is invalid', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          name: 'Diana Prince',
          email: 'not-an-email-address',
          password: 'ValidPassword123',
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      const emailIssue = response.body.error.details.find((d: any) => d.field === 'email');
      expect(emailIssue).toBeDefined();
    });

    it('should return 422 Validation Error when name is blank or missing', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          name: '   ',
          email: 'diana@themyscira.com',
          password: 'ValidPassword123',
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      const nameIssue = response.body.error.details.find((d: any) => d.field === 'name');
      expect(nameIssue).toBeDefined();
    });

    it('should return 422 Validation Error with all field errors when empty payload is submitted', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({});

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.length).toBeGreaterThanOrEqual(3);

      const fields = response.body.error.details.map((d: any) => d.field);
      expect(fields).toContain('name');
      expect(fields).toContain('email');
      expect(fields).toContain('password');
    });
  });
});
