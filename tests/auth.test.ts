import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { hashPassword, comparePassword } from '../src/utils/password.js';
import { generateToken, verifyToken } from '../src/utils/jwt.js';
import { registerSchema, loginSchema } from '../src/schemas/auth.schema.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { AuthService, toSafeUser } from '../src/services/auth.service.js';
import { ConflictError, UnauthorizedError } from '../src/errors/index.js';

describe('Authentication & User Management Pipeline (Day 4 & Day 5)', () => {
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
  // 2. JWT Generation & Verification Utilities (Day 5)
  // =========================================================================
  describe('JWT Token Utilities', () => {
    it('should sign and verify valid JWT token containing user identity and expiration claims', () => {
      const payload = { userId: 'user-uuid-1234', email: 'test@example.com' };
      const token = generateToken(payload, '2h');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // Header.Payload.Signature

      const decoded = verifyToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp! - decoded.iat!).toBe(7200); // 2 hours in seconds
    });

    it('should reject tampered or invalid JWT token', () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature';
      expect(() => verifyToken(invalidToken)).toThrow();
    });
  });

  // =========================================================================
  // 3. Input Validation Schemas & Normalization
  // =========================================================================
  describe('Registration & Login Zod Schemas', () => {
    it('registerSchema: should accept valid user payload and normalize email', () => {
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

    it('registerSchema: should reject email with invalid format', () => {
      const input = {
        name: 'Jane Doe',
        email: 'not-a-valid-email',
        password: 'ValidPassword123',
      };

      expect(() => registerSchema.parse(input)).toThrow();
    });

    it('registerSchema: should reject password with less than 8 characters', () => {
      const input = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'short',
      };

      expect(() => registerSchema.parse(input)).toThrow();
    });

    it('loginSchema: should accept valid credentials and normalize email', () => {
      const rawInput = {
        email: '  BRUCE@Wayne.COM  ',
        password: 'SuperSecret123',
      };

      const parsed = loginSchema.parse(rawInput);
      expect(parsed.email).toBe('bruce@wayne.com');
      expect(parsed.password).toBe('SuperSecret123');
    });

    it('loginSchema: should reject invalid email format', () => {
      expect(() => loginSchema.parse({ email: 'invalid-email', password: 'password123' })).toThrow();
    });

    it('loginSchema: should reject empty password', () => {
      expect(() => loginSchema.parse({ email: 'user@example.com', password: '' })).toThrow();
    });
  });

  // =========================================================================
  // 4. Repository Layer (UserRepository)
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
  // 5. Service Layer (AuthService)
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

    it('register: should register a new user and never expose passwordHash', async () => {
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

    it('register: should throw ConflictError if email is already registered', async () => {
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

    it('login: should authenticate valid user and return token and safe user profile', async () => {
      const rawPassword = 'ValidPassword123';
      const passwordHash = await hashPassword(rawPassword);

      const mockDbUser = {
        id: 'user-uuid-login',
        name: 'Login User',
        email: 'login@example.com',
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(mockUserRepo, 'findByEmail').mockResolvedValueOnce(mockDbUser);

      const result = await service.login({
        email: 'Login@Example.com',
        password: rawPassword,
      });

      expect(result).toHaveProperty('token');
      expect(typeof result.token).toBe('string');
      expect(result).toHaveProperty('user');
      expect(result.user.id).toBe('user-uuid-login');
      expect(result.user.email).toBe('login@example.com');
      expect((result.user as any).passwordHash).toBeUndefined();
      expect((result.user as any).password).toBeUndefined();

      const decoded = verifyToken(result.token);
      expect(decoded.userId).toBe('user-uuid-login');
      expect(decoded.email).toBe('login@example.com');
    });

    it('login: should throw generic UnauthorizedError when email is not found', async () => {
      vi.spyOn(mockUserRepo, 'findByEmail').mockResolvedValueOnce(null);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('login: should throw generic UnauthorizedError when password is wrong', async () => {
      const passwordHash = await hashPassword('CorrectPassword123');
      const mockDbUser = {
        id: 'user-uuid-wrongpass',
        name: 'User',
        email: 'user@example.com',
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(mockUserRepo, 'findByEmail').mockResolvedValueOnce(mockDbUser);

      await expect(
        service.login({
          email: 'user@example.com',
          password: 'WrongPassword!',
        })
      ).rejects.toThrow(UnauthorizedError);
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
  // 6. HTTP Integration Tests (POST /auth/register)
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

    it('should return 409 Conflict with standard error envelope when email is already registered', async () => {
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
          password: 'short',
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toBe('Validation failed');
      expect(Array.isArray(response.body.error.details)).toBe(true);

      const passwordIssue = response.body.error.details.find((d: any) => d.field === 'password');
      expect(passwordIssue).toBeDefined();
    });
  });

  // =========================================================================
  // 7. HTTP Integration Tests (POST /auth/login) - Day 5
  // =========================================================================
  describe('POST /auth/login HTTP Endpoint', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should successfully authenticate user with valid credentials and return 200 OK + JWT', async () => {
      const rawPassword = 'SuperSecretPassword123';
      const passwordHash = await hashPassword(rawPassword);

      const mockDbUser = {
        id: 'c807fb5e-2f5a-4b08-9df8-0123456789ab',
        name: 'Clark Kent',
        email: 'clark@dailyplanet.com',
        passwordHash,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockDbUser);

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: '  CLARK@DailyPlanet.COM  ', // Normalization check
          password: rawPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toEqual({
        id: 'c807fb5e-2f5a-4b08-9df8-0123456789ab',
        name: 'Clark Kent',
        email: 'clark@dailyplanet.com',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      // Security check: passwordHash must NEVER be exposed
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(response.body.user.password).toBeUndefined();
      expect(response.body.passwordHash).toBeUndefined();

      // Verify token authenticity and claims
      const decoded = verifyToken(response.body.token);
      expect(decoded.userId).toBe('c807fb5e-2f5a-4b08-9df8-0123456789ab');
      expect(decoded.email).toBe('clark@dailyplanet.com');
    });

    it('should also be accessible via versioned route POST /api/v1/auth/login', async () => {
      const rawPassword = 'SuperSecretPassword123';
      const passwordHash = await hashPassword(rawPassword);

      const mockDbUser = {
        id: 'c807fb5e-2f5a-4b08-9df8-0123456789ac',
        name: 'Barry Allen',
        email: 'barry@centralcity.com',
        passwordHash,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockDbUser);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'barry@centralcity.com',
          password: rawPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('barry@centralcity.com');
    });

    it('should return 401 Unauthorized with generic error envelope on incorrect password', async () => {
      const passwordHash = await hashPassword('CorrectPassword123');

      const mockDbUser = {
        id: 'mock-user-wrong-pass',
        name: 'Clark Kent',
        email: 'clark@dailyplanet.com',
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockDbUser);

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'clark@dailyplanet.com',
          password: 'IncorrectPassword999',
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          details: [],
        },
      });
      expect(response.body.token).toBeUndefined();
    });

    it('should return 401 Unauthorized with generic error envelope on unregistered email', async () => {
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nobody@dailyplanet.com',
          password: 'AnyPassword123',
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          details: [],
        },
      });
    });

    it('should return 422 Validation Error when email or password is missing', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({});

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      const fields = response.body.error.details.map((d: any) => d.field);
      expect(fields).toContain('email');
      expect(fields).toContain('password');
    });

    it('should return 422 Validation Error when email format is invalid', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'invalid-email-address',
          password: 'SomePassword123',
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const emailIssue = response.body.error.details.find((d: any) => d.field === 'email');
      expect(emailIssue).toBeDefined();
    });
  });
});
