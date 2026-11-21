import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { generateToken } from '../src/utils/jwt.js';
import { createProjectSchema, projectIdParamSchema } from '../src/schemas/project.schema.js';
import { ProjectRepository } from '../src/repositories/project.repository.js';
import { ProjectService } from '../src/services/project.service.js';
import { ProjectController } from '../src/controllers/project.controller.js';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '../src/errors/AppError.js';

describe('Project Management & Membership Association', () => {
  // Test user fixtures
  const mockOwner = {
    id: 'a1111111-1111-1111-1111-111111111111',
    name: 'Bruce Wayne',
    email: 'bruce@wayne.com',
    passwordHash: '$2a$10$hashedpasswordforbrucetest1234567890',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const mockMember = {
    id: 'b2222222-2222-2222-2222-222222222222',
    name: 'Dick Grayson',
    email: 'robin@wayne.com',
    passwordHash: '$2a$10$hashedpasswordforrobintest1234567890',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const mockNonMember = {
    id: 'c3333333-3333-3333-3333-333333333333',
    name: 'Arthur Fleck',
    email: 'joker@arkham.com',
    passwordHash: '$2a$10$hashedpasswordforjokertest1234567890',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const ownerToken = generateToken({ userId: mockOwner.id, email: mockOwner.email });
  const memberToken = generateToken({ userId: mockMember.id, email: mockMember.email });
  const nonMemberToken = generateToken({ userId: mockNonMember.id, email: mockNonMember.email });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Zod Validation Schema Tests
  // =========================================================================
  describe('Project Creation & Route Parameter Zod Schemas', () => {
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

    it('projectIdParamSchema should validate and trim non-empty projectId', () => {
      const input = { projectId: '  proj-12345  ' };
      const parsed = projectIdParamSchema.parse(input);
      expect(parsed.projectId).toBe('proj-12345');
    });

    it('projectIdParamSchema should reject blank or empty projectId', () => {
      expect(() => projectIdParamSchema.parse({ projectId: '   ' })).toThrow(/cannot be blank/);
      expect(() => projectIdParamSchema.parse({})).toThrow();
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
        ownerId: mockOwner.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdMember = {
        id: 'pm-123',
        projectId: 'p-123',
        userId: mockOwner.id,
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
        ownerId: mockOwner.id,
      });

      expect(mockDb.$transaction).toHaveBeenCalledOnce();
      expect(mockTx.project.create).toHaveBeenCalledWith({
        data: {
          name: 'Core Architecture',
          description: 'System baseline',
          ownerId: mockOwner.id,
        },
      });
      expect(mockTx.projectMember.create).toHaveBeenCalledWith({
        data: {
          projectId: 'p-123',
          userId: mockOwner.id,
        },
      });
      expect(result.id).toBe('p-123');
      expect(result.members).toHaveLength(1);
      expect(result.members[0].userId).toBe(mockOwner.id);
    });

    it('findByUserId should query projects where user is a member, ordered by createdAt desc', async () => {
      const mockProjects = [
        {
          id: 'p-2',
          name: 'Recent Project',
          description: null,
          ownerId: mockOwner.id,
          createdAt: new Date('2026-02-01'),
          updatedAt: new Date('2026-02-01'),
        },
        {
          id: 'p-1',
          name: 'Older Project',
          description: null,
          ownerId: mockOwner.id,
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
      const results = await repository.findByUserId(mockOwner.id);

      expect(mockDb.project.findMany).toHaveBeenCalledWith({
        where: {
          members: {
            some: {
              userId: mockOwner.id,
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

    it('findById should query single project by ID including owner and members with user info', async () => {
      const mockProject = {
        id: 'p-1',
        name: 'Single Project',
        description: 'Details',
        ownerId: mockOwner.id,
        owner: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
        members: [
          {
            id: 'pm-1',
            userId: mockOwner.id,
            joinedAt: new Date(),
            user: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
          },
        ],
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
        include: expect.objectContaining({
          owner: expect.any(Object),
          members: expect.any(Object),
        }),
      });
      expect(result).toEqual(mockProject);
    });

    it('findById should catch database invalid uuid error and return null gracefully', async () => {
      const mockDb = {
        project: {
          findUnique: vi.fn().mockRejectedValue({
            code: 'P2023',
            message: 'Inconsistent column data: invalid input syntax for type uuid',
          }),
        },
      } as any;

      const repository = new ProjectRepository(mockDb);
      const result = await repository.findById('not-a-valid-uuid');
      expect(result).toBeNull();
    });

    it('delete should invoke db.project.delete with projectId', async () => {
      const mockDeleted = {
        id: 'p-del-1',
        name: 'To Delete',
        ownerId: mockOwner.id,
      };

      const mockDb = {
        project: {
          delete: vi.fn().mockResolvedValue(mockDeleted),
        },
      } as any;

      const repository = new ProjectRepository(mockDb);
      const result = await repository.delete('p-del-1');

      expect(mockDb.project.delete).toHaveBeenCalledWith({
        where: { id: 'p-del-1' },
      });
      expect(result).toEqual(mockDeleted);
    });

    it('isMember should return true when membership exists and false otherwise', async () => {
      const mockDb = {
        projectMember: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce({ id: 'pm-1', projectId: 'p-1', userId: mockOwner.id })
            .mockResolvedValueOnce(null),
        },
      } as any;

      const repository = new ProjectRepository(mockDb);

      const isMemberTrue = await repository.isMember('p-1', mockOwner.id);
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
          ownerId: mockOwner.id,
          members: [{ id: 'pm-1', userId: mockOwner.id }],
        }),
      } as any;

      const service = new ProjectService(mockRepo);
      const result = await service.createProject(mockOwner.id, {
        name: 'TaskFlow',
        description: 'API',
      });

      expect(mockRepo.createWithMembership).toHaveBeenCalledWith({
        name: 'TaskFlow',
        description: 'API',
        ownerId: mockOwner.id,
      });
      expect(result.id).toBe('p-1');
    });

    it('getUserProjects should invoke repository findByUserId', async () => {
      const mockRepo = {
        findByUserId: vi.fn().mockResolvedValue([{ id: 'p-1' }]),
      } as any;

      const service = new ProjectService(mockRepo);
      const results = await service.getUserProjects(mockOwner.id);

      expect(mockRepo.findByUserId).toHaveBeenCalledWith(mockOwner.id);
      expect(results).toHaveLength(1);
    });

    it('getProjectById should return project if user is a member', async () => {
      const mockProject = {
        id: 'p-1',
        name: 'Team Project',
        ownerId: mockOwner.id,
        members: [{ id: 'pm-1', userId: mockMember.id }],
      };

      const mockRepo = {
        findById: vi.fn().mockResolvedValue(mockProject),
      } as any;

      const service = new ProjectService(mockRepo);
      const result = await service.getProjectById(mockMember.id, 'p-1');

      expect(result).toEqual(mockProject);
    });

    it('getProjectById should return project if user is the project owner', async () => {
      const mockProject = {
        id: 'p-1',
        name: 'Team Project',
        ownerId: mockOwner.id,
        members: [{ id: 'pm-1', userId: mockMember.id }],
      };

      const mockRepo = {
        findById: vi.fn().mockResolvedValue(mockProject),
      } as any;

      const service = new ProjectService(mockRepo);
      const result = await service.getProjectById(mockOwner.id, 'p-1');

      expect(result).toEqual(mockProject);
    });

    it('getProjectById should throw 404 NotFoundError if project does not exist', async () => {
      const mockRepo = {
        findById: vi.fn().mockResolvedValue(null),
      } as any;

      const service = new ProjectService(mockRepo);

      await expect(service.getProjectById(mockOwner.id, 'non-existent')).rejects.toThrow(NotFoundError);
    });

    it('getProjectById should throw 403 ForbiddenError if user is neither member nor owner', async () => {
      const mockProject = {
        id: 'p-1',
        name: 'Confidential Project',
        ownerId: mockOwner.id,
        members: [{ id: 'pm-1', userId: mockOwner.id }],
      };

      const mockRepo = {
        findById: vi.fn().mockResolvedValue(mockProject),
      } as any;

      const service = new ProjectService(mockRepo);

      await expect(service.getProjectById(mockNonMember.id, 'p-1')).rejects.toThrow(ForbiddenError);
    });

    it('deleteProject should delete project when requested by owner', async () => {
      const mockProject = {
        id: 'p-1',
        name: 'Project to Delete',
        ownerId: mockOwner.id,
      };

      const mockRepo = {
        findById: vi.fn().mockResolvedValue(mockProject),
        delete: vi.fn().mockResolvedValue(mockProject),
      } as any;

      const service = new ProjectService(mockRepo);
      await service.deleteProject(mockOwner.id, 'p-1');

      expect(mockRepo.delete).toHaveBeenCalledWith('p-1');
    });

    it('deleteProject should throw 404 NotFoundError if project does not exist', async () => {
      const mockRepo = {
        findById: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      } as any;

      const service = new ProjectService(mockRepo);

      await expect(service.deleteProject(mockOwner.id, 'non-existent')).rejects.toThrow(NotFoundError);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('deleteProject should throw 403 ForbiddenError if non-owner member attempts deletion', async () => {
      const mockProject = {
        id: 'p-1',
        name: 'Project to Delete',
        ownerId: mockOwner.id,
        members: [{ id: 'pm-1', userId: mockMember.id }],
      };

      const mockRepo = {
        findById: vi.fn().mockResolvedValue(mockProject),
        delete: vi.fn(),
      } as any;

      const service = new ProjectService(mockRepo);

      await expect(service.deleteProject(mockMember.id, 'p-1')).rejects.toThrow(ForbiddenError);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('deleteProject should throw 403 ForbiddenError if non-member attempts deletion', async () => {
      const mockProject = {
        id: 'p-1',
        name: 'Project to Delete',
        ownerId: mockOwner.id,
      };

      const mockRepo = {
        findById: vi.fn().mockResolvedValue(mockProject),
        delete: vi.fn(),
      } as any;

      const service = new ProjectService(mockRepo);

      await expect(service.deleteProject(mockNonMember.id, 'p-1')).rejects.toThrow(ForbiddenError);
      expect(mockRepo.delete).not.toHaveBeenCalled();
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
        ownerId: mockOwner.id,
        members: [{ id: 'pm-1', userId: mockOwner.id }],
      };

      const mockService = {
        createProject: vi.fn().mockResolvedValue(mockProject),
      } as any;

      const controller = new ProjectController(mockService);

      const req: any = {
        user: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
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
        user: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
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

    it('getById should return 200 OK with project in body', async () => {
      const mockProject = { id: 'p-1', name: 'Project Alpha' };
      const mockService = {
        getProjectById: vi.fn().mockResolvedValue(mockProject),
      } as any;

      const controller = new ProjectController(mockService);

      const req: any = {
        user: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
        params: { projectId: 'p-1' },
      };

      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.getById(req, res, vi.fn());

      expect(mockService.getProjectById).toHaveBeenCalledWith(mockOwner.id, 'p-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ project: mockProject });
    });

    it('delete should return 200 OK with success message', async () => {
      const mockService = {
        deleteProject: vi.fn().mockResolvedValue(undefined),
      } as any;

      const controller = new ProjectController(mockService);

      const req: any = {
        user: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
        params: { projectId: 'p-1' },
      };

      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.delete(req, res, vi.fn());

      expect(mockService.deleteProject).toHaveBeenCalledWith(mockOwner.id, 'p-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Project deleted successfully',
        projectId: 'p-1',
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
  // 5. HTTP Integration Tests (POST, GET, DELETE /projects)
  // =========================================================================
  describe('HTTP Endpoints - Full Integration Scenarios', () => {
    // -----------------------------------------------------------------------
    // POST /projects
    // -----------------------------------------------------------------------
    it('POST /projects: should successfully create project and return 201 with owner membership', async () => {
      const expectedProject = {
        id: 'proj-uuid-1234',
        name: 'Backend Engineering',
        description: 'Internship project tasks',
        ownerId: mockOwner.id,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        members: [
          {
            id: 'pm-uuid-1',
            projectId: 'proj-uuid-1234',
            userId: mockOwner.id,
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
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
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: '  Backend Engineering  ',
          description: '  Internship project tasks  ',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Project created successfully');
      expect(response.body).toHaveProperty('project');
      expect(response.body.project.name).toBe('Backend Engineering');
      expect(response.body.project.ownerId).toBe(mockOwner.id);
      expect(response.body.project.members).toHaveLength(1);
      expect(response.body.project.members[0].userId).toBe(mockOwner.id);
    });

    it('POST /projects: should accept title in request body and normalize to project name', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          project: {
            create: vi.fn().mockResolvedValue({
              id: 'proj-title-1',
              name: 'From Title Field',
              description: null,
              ownerId: mockOwner.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          projectMember: {
            create: vi.fn().mockResolvedValue({
              id: 'pm-title-1',
              projectId: 'proj-title-1',
              userId: mockOwner.id,
              joinedAt: new Date(),
            }),
          },
        });
      });

      const response = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
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
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);

      const responseBlank = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: '   ',
        });

      expect(responseBlank.status).toBe(422);
      expect(responseBlank.body.error.code).toBe('VALIDATION_ERROR');

      const responseMissing = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          description: 'No name provided',
        });

      expect(responseMissing.status).toBe(422);
      expect(responseMissing.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/projects: should work identically under the versioned route prefix', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          project: {
            create: vi.fn().mockResolvedValue({
              id: 'p-v1',
              name: 'Versioned Project',
              description: null,
              ownerId: mockOwner.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          projectMember: {
            create: vi.fn().mockResolvedValue({
              id: 'pm-v1',
              projectId: 'p-v1',
              userId: mockOwner.id,
              joinedAt: new Date(),
            }),
          },
        });
      });

      const response = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Versioned Project',
        });

      expect(response.status).toBe(201);
      expect(response.body.project.name).toBe('Versioned Project');
    });

    // -----------------------------------------------------------------------
    // GET /projects (List)
    // -----------------------------------------------------------------------
    it('GET /projects: should return 200 OK and all projects where user is a member', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Team Project 1',
          description: 'First active project',
          ownerId: mockOwner.id,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          updatedAt: new Date('2026-02-01T00:00:00.000Z'),
          owner: {
            id: mockOwner.id,
            name: mockOwner.name,
            email: mockOwner.email,
          },
          members: [
            {
              id: 'pm-1',
              userId: mockOwner.id,
              joinedAt: new Date('2026-02-01T00:00:00.000Z'),
            },
          ],
        },
      ];

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma.project, 'findMany').mockResolvedValue(mockProjects as any);

      const response = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('projects');
      expect(Array.isArray(response.body.projects)).toBe(true);
      expect(response.body.projects).toHaveLength(1);
      expect(response.body.projects[0].id).toBe('proj-1');
      expect(response.body.projects[0].name).toBe('Team Project 1');
      expect(response.body.projects[0].owner.email).toBe(mockOwner.email);
    });

    it('GET /projects: should return empty array when user is not a member of any projects', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma.project, 'findMany').mockResolvedValue([]);

      const response = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.projects).toEqual([]);
    });

    it('GET /projects: should return 401 Unauthorized when token is missing', async () => {
      const response = await request(app).get('/projects');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/projects: should work identically under the versioned route prefix', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma.project, 'findMany').mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.projects).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // GET /projects/:projectId (Single Project Details)
    // -----------------------------------------------------------------------
    it('GET /projects/:projectId: should return 200 OK and project details when user is a member', async () => {
      const mockProject = {
        id: 'proj-single-1',
        name: 'Shared Architecture',
        description: 'Team project specification',
        ownerId: mockOwner.id,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
        owner: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
        members: [
          {
            id: 'pm-1',
            userId: mockOwner.id,
            joinedAt: new Date(),
            user: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
          },
          {
            id: 'pm-2',
            userId: mockMember.id,
            joinedAt: new Date(),
            user: { id: mockMember.id, name: mockMember.name, email: mockMember.email },
          },
        ],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockMember);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);

      const response = await request(app)
        .get('/projects/proj-single-1')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('project');
      expect(response.body.project.id).toBe('proj-single-1');
      expect(response.body.project.name).toBe('Shared Architecture');
      expect(response.body.project.members).toHaveLength(2);
    });

    it('GET /projects/:projectId: should return 200 OK when user is the owner', async () => {
      const mockProject = {
        id: 'proj-single-2',
        name: 'Owner Project',
        description: null,
        ownerId: mockOwner.id,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
        owner: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
        members: [
          {
            id: 'pm-1',
            userId: mockOwner.id,
            joinedAt: new Date(),
            user: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
          },
        ],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);

      const response = await request(app)
        .get('/projects/proj-single-2')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.project.id).toBe('proj-single-2');
    });

    it('GET /projects/:projectId: should return 403 Forbidden when authenticated user is NOT a project member', async () => {
      const mockProject = {
        id: 'proj-private-1',
        name: 'Classified Wayne Tech',
        description: 'Batmobile specs',
        ownerId: mockOwner.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
        members: [
          {
            id: 'pm-1',
            userId: mockOwner.id,
            joinedAt: new Date(),
            user: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
          },
        ],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockNonMember);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);

      const response = await request(app)
        .get('/projects/proj-private-1')
        .set('Authorization', `Bearer ${nonMemberToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toBe('You do not have access to this project');
    });

    it('GET /projects/:projectId: should return 404 Not Found when project does not exist', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);

      const response = await request(app)
        .get('/projects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
      expect(response.body.error.message).toBe('Project not found');
    });

    it('GET /projects/:projectId: should return 401 Unauthorized when request is unauthenticated', async () => {
      const response = await request(app).get('/projects/proj-single-1');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/projects/:projectId: should work identically under versioned prefix', async () => {
      const mockProject = {
        id: 'proj-v1-single',
        name: 'Versioned Single Project',
        description: null,
        ownerId: mockOwner.id,
        owner: { id: mockOwner.id, name: mockOwner.name, email: mockOwner.email },
        members: [{ id: 'pm-1', userId: mockOwner.id, joinedAt: new Date() }],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);

      const response = await request(app)
        .get('/api/v1/projects/proj-v1-single')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.project.name).toBe('Versioned Single Project');
    });

    // -----------------------------------------------------------------------
    // DELETE /projects/:projectId (Owner Project Deletion)
    // -----------------------------------------------------------------------
    it('DELETE /projects/:projectId: should allow project owner to delete project and return 200 OK', async () => {
      const mockProject = {
        id: 'proj-to-delete',
        name: 'Deletable Project',
        ownerId: mockOwner.id,
        members: [{ id: 'pm-1', userId: mockOwner.id }],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      const deleteSpy = vi.spyOn(prisma.project, 'delete').mockResolvedValue(mockProject as any);

      const response = await request(app)
        .delete('/projects/proj-to-delete')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Project deleted successfully',
        projectId: 'proj-to-delete',
      });
      expect(deleteSpy).toHaveBeenCalledWith({
        where: { id: 'proj-to-delete' },
      });
    });

    it('DELETE /projects/:projectId: should return 403 Forbidden when non-owner member attempts deletion', async () => {
      const mockProject = {
        id: 'proj-to-delete',
        name: 'Team Project',
        ownerId: mockOwner.id, // Owner is Bruce
        members: [
          { id: 'pm-1', userId: mockOwner.id },
          { id: 'pm-2', userId: mockMember.id }, // Dick is member, not owner
        ],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockMember);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      const deleteSpy = vi.spyOn(prisma.project, 'delete');

      const response = await request(app)
        .delete('/projects/proj-to-delete')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toBe('Only the project owner can delete this project');
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('DELETE /projects/:projectId: should return 403 Forbidden when non-member attempts deletion', async () => {
      const mockProject = {
        id: 'proj-to-delete',
        name: 'Private Project',
        ownerId: mockOwner.id,
        members: [{ id: 'pm-1', userId: mockOwner.id }],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockNonMember);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      const deleteSpy = vi.spyOn(prisma.project, 'delete');

      const response = await request(app)
        .delete('/projects/proj-to-delete')
        .set('Authorization', `Bearer ${nonMemberToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toBe('Only the project owner can delete this project');
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('DELETE /projects/:projectId: should return 404 Not Found when project does not exist', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);
      const deleteSpy = vi.spyOn(prisma.project, 'delete');

      const response = await request(app)
        .delete('/projects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
      expect(response.body.error.message).toBe('Project not found');
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('DELETE /projects/:projectId: should return 401 Unauthorized when request is unauthenticated', async () => {
      const response = await request(app).delete('/projects/proj-to-delete');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('DELETE /api/v1/projects/:projectId: should work identically under versioned prefix', async () => {
      const mockProject = {
        id: 'proj-v1-delete',
        name: 'Versioned Delete Project',
        ownerId: mockOwner.id,
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockOwner);
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      const deleteSpy = vi.spyOn(prisma.project, 'delete').mockResolvedValue(mockProject as any);

      const response = await request(app)
        .delete('/api/v1/projects/proj-v1-delete')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Project deleted successfully');
      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: 'proj-v1-delete' } });
    });
  });
});
