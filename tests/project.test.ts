import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { generateToken } from '../src/utils/jwt.js';
import { createProjectSchema } from '../src/schemas/project.schema.js';
import { ProjectRepository } from '../src/repositories/project.repository.js';
import { ProjectService } from '../src/services/project.service.js';
import { ProjectController } from '../src/controllers/project.controller.js';
import { UnauthorizedError } from '../src/errors/AppError.js';

describe('Project Management & Membership Association', () => {
  // Test user fixtures
  const mockUser = {
    id: 'a1111111-1111-1111-1111-111111111111',
    name: 'Bruce Wayne',
    email: 'bruce@wayne.com',
    passwordHash: '$2a$10$hashedpasswordforbrucetest1234567890',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const validToken = generateToken({ userId: mockUser.id, email: mockUser.email });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Zod Validation Schema Tests
  // =========================================================================
  describe('Project Creation Zod Schema (createProjectSchema)', () => {
    it('should validate and sanitize project with name and description', () => {
      const input = {
        name: '  Backend Platform  ',
        description: '  Enterprise task management engine  ',
      };

      const parsed = createProjectSchema.parse(input);

      expect(parsed.name).toBe('Backend Platform');
      expect(parsed.description).toBe('Enterprise task management engine');
    });

    it('should accept title alias and normalize it to name', () => {
      const input = {
        title: '  Mobile App Redesign  ',
        description: 'New Flutter UI',
      };

      const parsed = createProjectSchema.parse(input);

      expect(parsed.name).toBe('Mobile App Redesign');
      expect(parsed.description).toBe('New Flutter UI');
    });

    it('should convert empty or whitespace-only description to null', () => {
      const input = {
        name: 'Infrastructure Setup',
        description: '   ',
      };

      const parsed = createProjectSchema.parse(input);

      expect(parsed.name).toBe('Infrastructure Setup');
      expect(parsed.description).toBeNull();
    });

    it('should convert omitted description to null', () => {
      const input = {
        name: 'DevOps Pipeline',
      };

      const parsed = createProjectSchema.parse(input);

      expect(parsed.name).toBe('DevOps Pipeline');
      expect(parsed.description).toBeNull();
    });

    it('should reject payload with missing name and title', () => {
      const input = {
        description: 'Missing project name',
      };

      expect(() => createProjectSchema.parse(input)).toThrow(/Project name is required/);
    });

    it('should reject blank or whitespace-only name', () => {
      const input = {
        name: '   ',
      };

      expect(() => createProjectSchema.parse(input)).toThrow(/Project name cannot be blank/);
    });

    it('should reject name exceeding 150 characters', () => {
      const input = {
        name: 'A'.repeat(151),
      };

      expect(() => createProjectSchema.parse(input)).toThrow(/cannot exceed 150 characters/);
    });

    it('should reject description exceeding 1000 characters', () => {
      const input = {
        name: 'Valid Name',
        description: 'D'.repeat(1001),
      };

      expect(() => createProjectSchema.parse(input)).toThrow(/cannot exceed 1000 characters/);
    });
  });

  // =========================================================================
  // 2. Repository Layer Unit Tests (ProjectRepository)
  // =========================================================================
  describe('ProjectRepository Unit Tests', () => {
    it('createWithMembership should execute inside $transaction, creating both project and owner membership', async () => {
      const createdProject = {
        id: 'p-123',
        name: 'Core Architecture',
        description: 'System baseline',
        ownerId: mockUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdMember = {
        id: 'pm-123',
        projectId: 'p-123',
        userId: mockUser.id,
        joinedAt: new Date(),
      };

      const mockTx = {
        project: {
          create: vi.fn().mockResolvedValue(createdProject),
        },
        projectMember: {
          create: vi.fn().mockResolvedValue(createdMember),
        },
      };

      const mockDb = {
        $transaction: vi.fn().mockImplementation(async (callback) => callback(mockTx)),
      } as any;

      const repository = new ProjectRepository(mockDb);

      const result = await repository.createWithMembership({
        name: 'Core Architecture',
        description: 'System baseline',
        ownerId: mockUser.id,
      });

      expect(mockDb.$transaction).toHaveBeenCalledOnce();
      expect(mockTx.project.create).toHaveBeenCalledWith({
        data: {
          name: 'Core Architecture',
          description: 'System baseline',
          ownerId: mockUser.id,
        },
      });
      expect(mockTx.projectMember.create).toHaveBeenCalledWith({
        data: {
          projectId: 'p-123',
          userId: mockUser.id,
        },
      });
      expect(result.id).toBe('p-123');
      expect(result.members).toHaveLength(1);
      expect(result.members[0].userId).toBe(mockUser.id);
    });

    it('findByUserId should query projects where user is a member, ordered by createdAt desc', async () => {
      const mockProjects = [
        {
          id: 'p-2',
          name: 'Recent Project',
          description: null,
          ownerId: mockUser.id,
          createdAt: new Date('2026-02-01'),
          updatedAt: new Date('2026-02-01'),
        },
        {
          id: 'p-1',
          name: 'Older Project',
          description: null,
          ownerId: mockUser.id,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];

      const mockDb = {
        project: {
          findMany: vi.fn().mockResolvedValue(mockProjects),
        },
      } as any;

      const repository = new ProjectRepository(mockDb);
      const results = await repository.findByUserId(mockUser.id);

      expect(mockDb.project.findMany).toHaveBeenCalledWith({
        where: {
          members: {
            some: {
              userId: mockUser.id,
            },
          },
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          members: {
            select: {
              id: true,
              userId: true,
              joinedAt: true,
            },
            orderBy: {
              joinedAt: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Recent Project');
    });

    it('findById should query single project by UUID', async () => {
      const mockProject = {
        id: 'p-1',
        name: 'Single Project',
        description: null,
        ownerId: mockUser.id,
      };

      const mockDb = {
        project: {
          findUnique: vi.fn().mockResolvedValue(mockProject),
        },
      } as any;

      const repository = new ProjectRepository(mockDb);
      const result = await repository.findById('p-1');

      expect(mockDb.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        include: expect.any(Object),
      });
      expect(result).toEqual(mockProject);
    });

    it('isMember should return true when membership exists and false otherwise', async () => {
      const mockDb = {
        projectMember: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce({ id: 'pm-1', projectId: 'p-1', userId: mockUser.id })
            .mockResolvedValueOnce(null),
        },
      } as any;

      const repository = new ProjectRepository(mockDb);

      const isMemberTrue = await repository.isMember('p-1', mockUser.id);
      expect(isMemberTrue).toBe(true);

      const isMemberFalse = await repository.isMember('p-1', 'other-user');
      expect(isMemberFalse).toBe(false);
    });
  });

  // =========================================================================
  // 3. Service Layer Unit Tests (ProjectService)
  // =========================================================================
  describe('ProjectService Unit Tests', () => {
    it('createProject should invoke repository createWithMembership with ownerId and input', async () => {
      const mockRepo = {
        createWithMembership: vi.fn().mockResolvedValue({
          id: 'p-1',
          name: 'TaskFlow',
          description: 'API',
          ownerId: mockUser.id,
          members: [{ id: 'pm-1', userId: mockUser.id }],
        }),
      } as any;

      const service = new ProjectService(mockRepo);
      const result = await service.createProject(mockUser.id, {
        name: 'TaskFlow',
        description: 'API',
      });

      expect(mockRepo.createWithMembership).toHaveBeenCalledWith({
        name: 'TaskFlow',
        description: 'API',
        ownerId: mockUser.id,
      });
      expect(result.id).toBe('p-1');
    });

    it('getUserProjects should invoke repository findByUserId', async () => {
      const mockRepo = {
        findByUserId: vi.fn().mockResolvedValue([{ id: 'p-1' }]),
      } as any;

      const service = new ProjectService(mockRepo);
      const results = await service.getUserProjects(mockUser.id);

      expect(mockRepo.findByUserId).toHaveBeenCalledWith(mockUser.id);
      expect(results).toHaveLength(1);
    });
  });

  // =========================================================================
  // 4. Controller Layer Unit Tests (ProjectController)
  // =========================================================================
  describe('ProjectController Unit Tests', () => {
    it('create should return 201 Created with project in body', async () => {
      const mockProject = {
        id: 'p-1',
        name: 'Project Alpha',
        description: null,
        ownerId: mockUser.id,
        members: [{ id: 'pm-1', userId: mockUser.id }],
      };

      const mockService = {
        createProject: vi.fn().mockResolvedValue(mockProject),
      } as any;

      const controller = new ProjectController(mockService);

      const req: any = {
        user: { id: mockUser.id, name: mockUser.name, email: mockUser.email },
        body: { name: 'Project Alpha', description: null },
      };

      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.create(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Project created successfully',
        project: mockProject,
      });
    });

    it('list should return 200 OK with projects array', async () => {
      const mockProjects = [{ id: 'p-1', name: 'Project Alpha' }];
      const mockService = {
        getUserProjects: vi.fn().mockResolvedValue(mockProjects),
      } as any;

      const controller = new ProjectController(mockService);

      const req: any = {
        user: { id: mockUser.id, name: mockUser.name, email: mockUser.email },
      };

      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.list(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        projects: mockProjects,
      });
    });

    it('should reject unauthenticated request without req.user', async () => {
      const controller = new ProjectController({} as any);

      const req: any = { user: undefined };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await controller.create(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  // =========================================================================
  // 5. HTTP Integration Tests (POST /projects & GET /projects)
  // =========================================================================
  describe('HTTP Endpoints - POST /projects & GET /projects', () => {
    it('POST /projects: should successfully create project and return 201 with owner membership', async () => {
      const expectedProject = {
        id: 'proj-uuid-1234',
        name: 'Backend Engineering',
        description: 'Internship project tasks',
        ownerId: mockUser.id,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        members: [
          {
            id: 'pm-uuid-1',
            projectId: 'proj-uuid-1234',
            userId: mockUser.id,
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          project: {
            create: vi.fn().mockResolvedValue({
              id: expectedProject.id,
              name: expectedProject.name,
              description: expectedProject.description,
              ownerId: expectedProject.ownerId,
              createdAt: expectedProject.createdAt,
              updatedAt: expectedProject.updatedAt,
            }),
          },
          projectMember: {
            create: vi.fn().mockResolvedValue(expectedProject.members[0]),
          },
        });
      });

      const response = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: '  Backend Engineering  ',
          description: '  Internship project tasks  ',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Project created successfully');
      expect(response.body).toHaveProperty('project');
      expect(response.body.project.name).toBe('Backend Engineering');
      expect(response.body.project.ownerId).toBe(mockUser.id);
      expect(response.body.project.members).toHaveLength(1);
      expect(response.body.project.members[0].userId).toBe(mockUser.id);
    });

    it('POST /projects: should accept title in request body and normalize to project name', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          project: {
            create: vi.fn().mockResolvedValue({
              id: 'proj-title-1',
              name: 'From Title Field',
              description: null,
              ownerId: mockUser.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          projectMember: {
            create: vi.fn().mockResolvedValue({
              id: 'pm-title-1',
              projectId: 'proj-title-1',
              userId: mockUser.id,
              joinedAt: new Date(),
            }),
          },
        });
      });

      const response = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          title: '  From Title Field  ',
        });

      expect(response.status).toBe(201);
      expect(response.body.project.name).toBe('From Title Field');
    });

    it('POST /projects: should reject unauthenticated request with 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/projects')
        .send({
          name: 'Unauthenticated Project',
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token is required',
          details: [],
        },
      });
    });

    it('POST /projects: should reject invalid JWT token with 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/projects')
        .set('Authorization', 'Bearer invalid.token.signature')
        .send({
          name: 'Invalid Token Project',
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('POST /projects: should return 422 Validation Error when name is blank or missing', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);

      const responseBlank = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: '   ',
        });

      expect(responseBlank.status).toBe(422);
      expect(responseBlank.body.error.code).toBe('VALIDATION_ERROR');

      const responseMissing = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          description: 'No name provided',
        });

      expect(responseMissing.status).toBe(422);
      expect(responseMissing.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/projects: should work identically under the versioned route prefix', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          project: {
            create: vi.fn().mockResolvedValue({
              id: 'p-v1',
              name: 'Versioned Project',
              description: null,
              ownerId: mockUser.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          projectMember: {
            create: vi.fn().mockResolvedValue({
              id: 'pm-v1',
              projectId: 'p-v1',
              userId: mockUser.id,
              joinedAt: new Date(),
            }),
          },
        });
      });

      const response = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: 'Versioned Project',
        });

      expect(response.status).toBe(201);
      expect(response.body.project.name).toBe('Versioned Project');
    });

    it('GET /projects: should return 200 OK and all projects where user is a member', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Team Project 1',
          description: 'First active project',
          ownerId: mockUser.id,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          updatedAt: new Date('2026-02-01T00:00:00.000Z'),
          owner: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
          },
          members: [
            {
              id: 'pm-1',
              userId: mockUser.id,
              joinedAt: new Date('2026-02-01T00:00:00.000Z'),
            },
          ],
        },
      ];

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);
      vi.spyOn(prisma.project, 'findMany').mockResolvedValue(mockProjects as any);

      const response = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('projects');
      expect(Array.isArray(response.body.projects)).toBe(true);
      expect(response.body.projects).toHaveLength(1);
      expect(response.body.projects[0].id).toBe('proj-1');
      expect(response.body.projects[0].name).toBe('Team Project 1');
      expect(response.body.projects[0].owner.email).toBe(mockUser.email);
    });

    it('GET /projects: should return empty array when user is not a member of any projects', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);
      vi.spyOn(prisma.project, 'findMany').mockResolvedValue([]);

      const response = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.projects).toEqual([]);
    });

    it('GET /projects: should return 401 Unauthorized when token is missing', async () => {
      const response = await request(app).get('/projects');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/projects: should work identically under the versioned route prefix', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);
      vi.spyOn(prisma.project, 'findMany').mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.projects).toEqual([]);
    });
  });
});
