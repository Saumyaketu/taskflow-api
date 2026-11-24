import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { generateToken } from '../src/utils/jwt.js';
import {
  createTaskSchema,
  iso8601DateSchema,
  taskIdParamSchema,
} from '../src/schemas/task.schema.js';
import { TaskRepository } from '../src/repositories/task.repository.js';
import { TaskService } from '../src/services/task.service.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../src/errors/AppError.js';
import { Priority, TaskStatus } from '@prisma/client';

describe('Task Management Engine - Task Creation', () => {
  // -------------------------------------------------------------------------
  // Test Fixtures & Factories
  // -------------------------------------------------------------------------
  const createUser = (id: string, name: string, email: string) => ({
    id,
    name,
    email,
    passwordHash: '$2a$10$hashedpasswordfore2etesting1234567890',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  const owner = createUser('a1111111-1111-1111-1111-111111111111', 'Bruce Wayne', 'bruce@wayne.com');
  const member = createUser('b2222222-2222-2222-2222-222222222222', 'Dick Grayson', 'robin@wayne.com');
  const outsider = createUser('c3333333-3333-3333-3333-333333333333', 'Arthur Fleck', 'joker@arkham.com');

  const ownerToken = generateToken({ userId: owner.id, email: owner.email });
  const memberToken = generateToken({ userId: member.id, email: member.email });
  const outsiderToken = generateToken({ userId: outsider.id, email: outsider.email });

  const createProjectFixture = (
    id = 'p-1',
    name = 'TaskFlow Core',
    ownerUser = owner,
    membersList: any[] = [owner, member]
  ) => ({
    id,
    name,
    description: 'Project description',
    ownerId: ownerUser.id,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    owner: { id: ownerUser.id, name: ownerUser.name, email: ownerUser.email },
    members: membersList.map((u, i) => ({
      id: `pm-${i + 1}`,
      projectId: id,
      userId: u.id,
      joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: u.id, name: u.name, email: u.email },
    })),
  });

  const createTaskFixture = (overrides: Partial<any> = {}) => ({
    id: 't-1',
    projectId: 'p-1',
    creatorId: member.id,
    assigneeId: member.id,
    title: 'Implement Task API',
    description: 'Build robust task endpoints',
    priority: Priority.HIGH,
    status: TaskStatus.TODO,
    dueDate: new Date('2026-12-31T23:59:59.000Z'),
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    creator: { id: member.id, name: member.name, email: member.email },
    assignee: { id: member.id, name: member.name, email: member.email },
    ...overrides,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    (vi.spyOn(prisma.user, 'findUnique') as any).mockImplementation(async (args: any) => {
      const id = args?.where?.id;
      if (id === owner.id) return owner;
      if (id === member.id) return member;
      if (id === outsider.id) return outsider;
      return null;
    });
  });

  // =========================================================================
  // 1. Zod Validation Schemas
  // =========================================================================
  describe('Validation Schemas (createTaskSchema, iso8601DateSchema, taskIdParamSchema)', () => {
    it('iso8601DateSchema: validates standard ISO date formats and rejects invalid strings', () => {
      expect(iso8601DateSchema.parse('2026-12-31')).toBe('2026-12-31');
      expect(iso8601DateSchema.parse('2026-12-31T23:59:59.000Z')).toBe('2026-12-31T23:59:59.000Z');
      expect(() => iso8601DateSchema.parse('not-a-date')).toThrow();
      expect(() => iso8601DateSchema.parse('2026-13-45')).toThrow();
    });

    it('taskIdParamSchema: validates non-empty taskId and rejects blank', () => {
      expect(taskIdParamSchema.parse({ taskId: 't-100' })).toEqual({ taskId: 't-100' });
      expect(() => taskIdParamSchema.parse({ taskId: '   ' })).toThrow(/cannot be blank/);
      expect(() => taskIdParamSchema.parse({})).toThrow();
    });

    it('createTaskSchema: sets default priority and status when omitted', () => {
      const parsed = createTaskSchema.parse({
        title: '  Complete Documentation  ',
      });

      expect(parsed).toEqual({
        title: 'Complete Documentation',
        description: null,
        priority: Priority.MEDIUM,
        status: TaskStatus.TODO,
        assigneeId: null,
        dueDate: null,
      });
    });

    it('createTaskSchema: accepts full valid inputs with snake_case aliases and parses Date', () => {
      const parsed = createTaskSchema.parse({
        title: 'Integration Testing',
        description: 'Ensure full test coverage',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        assignee_id: 'b2222222-2222-2222-2222-222222222222',
        due_date: '2026-12-31T23:59:59.000Z',
      });

      expect(parsed.title).toBe('Integration Testing');
      expect(parsed.priority).toBe(Priority.HIGH);
      expect(parsed.status).toBe(TaskStatus.IN_PROGRESS);
      expect(parsed.assigneeId).toBe('b2222222-2222-2222-2222-222222222222');
      expect(parsed.dueDate).toBeInstanceOf(Date);
    });

    it('createTaskSchema: rejects empty or blank title', () => {
      expect(() => createTaskSchema.parse({ title: '' })).toThrow(/cannot be blank/);
      expect(() => createTaskSchema.parse({ title: '   ' })).toThrow(/cannot be blank/);
      expect(() => createTaskSchema.parse({})).toThrow();
    });

    it('createTaskSchema: rejects invalid priority enum values', () => {
      expect(() =>
        createTaskSchema.parse({
          title: 'Test',
          priority: 'URGENT',
        })
      ).toThrow(/LOW.*MEDIUM.*HIGH/);
    });

    it('createTaskSchema: rejects invalid status enum values', () => {
      expect(() =>
        createTaskSchema.parse({
          title: 'Test',
          status: 'PENDING',
        })
      ).toThrow(/TODO.*IN_PROGRESS.*DONE/);
    });

    it('createTaskSchema: rejects invalid due_date format', () => {
      expect(() =>
        createTaskSchema.parse({
          title: 'Test',
          due_date: 'next week',
        })
      ).toThrow(/due_date must be a valid ISO-8601/);
    });
  });

  // =========================================================================
  // 2. Repository Layer Unit Tests
  // =========================================================================
  describe('TaskRepository Unit Tests', () => {
    it('create: persists task with relationships to creator and assignee', async () => {
      const mockTask = createTaskFixture();
      const mockDb = {
        task: {
          create: vi.fn().mockResolvedValue(mockTask),
        },
      } as any;

      const repo = new TaskRepository(mockDb);
      const res = await repo.create({
        projectId: 'p-1',
        creatorId: member.id,
        title: 'Implement Task API',
        priority: Priority.HIGH,
        status: TaskStatus.TODO,
        assigneeId: member.id,
      });

      expect(mockDb.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'p-1',
            creatorId: member.id,
            title: 'Implement Task API',
            priority: Priority.HIGH,
            status: TaskStatus.TODO,
            assigneeId: member.id,
          }),
        })
      );
      expect(res.id).toBe('t-1');
      expect(res.creator.email).toBe(member.email);
    });

    it('findById: queries task with relations and handles uuid errors gracefully', async () => {
      const mockDb = {
        task: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(createTaskFixture())
            .mockRejectedValueOnce({ code: 'P2023', message: 'invalid input syntax for type uuid' }),
        },
      } as any;

      const repo = new TaskRepository(mockDb);
      const found = await repo.findById('t-1');
      expect(found?.title).toBe('Implement Task API');

      const invalid = await repo.findById('not-a-uuid');
      expect(invalid).toBeNull();
    });
  });

  // =========================================================================
  // 3. Service Layer Unit Tests
  // =========================================================================
  describe('TaskService Unit Tests', () => {
    it('createTask: successfully creates task for project member and sets completedAt when status is DONE', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const mockProjectRepo = {
        findById: vi.fn().mockResolvedValue(proj),
      } as any;
      const mockTaskRepo = {
        create: vi.fn().mockImplementation(async (data) => createTaskFixture(data)),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);

      const task = await service.createTask(member.id, 'p-1', {
        title: 'Completed task',
        description: null,
        priority: Priority.LOW,
        status: TaskStatus.DONE,
        assigneeId: owner.id,
        dueDate: null,
      });

      expect(mockTaskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'p-1',
          creatorId: member.id,
          title: 'Completed task',
          status: TaskStatus.DONE,
          completedAt: expect.any(Date),
        })
      );
      expect(task.title).toBe('Completed task');
    });

    it('createTask: rejects creation if project does not exist (404 Not Found)', async () => {
      const mockProjectRepo = {
        findById: vi.fn().mockResolvedValue(null),
      } as any;
      const mockTaskRepo = {
        create: vi.fn(),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);

      await expect(
        service.createTask(member.id, 'non-existent', {
          title: 'Some Task',
          description: null,
          priority: Priority.MEDIUM,
          status: TaskStatus.TODO,
          assigneeId: null,
          dueDate: null,
        })
      ).rejects.toThrow(NotFoundError);
      expect(mockTaskRepo.create).not.toHaveBeenCalled();
    });

    it('createTask: rejects creation if caller is not a member of the project (403 Forbidden)', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const mockProjectRepo = {
        findById: vi.fn().mockResolvedValue(proj),
      } as any;
      const mockTaskRepo = {
        create: vi.fn(),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);

      await expect(
        service.createTask(outsider.id, 'p-1', {
          title: 'Outsider Task',
          description: null,
          priority: Priority.MEDIUM,
          status: TaskStatus.TODO,
          assigneeId: null,
          dueDate: null,
        })
      ).rejects.toThrow(ForbiddenError);
      expect(mockTaskRepo.create).not.toHaveBeenCalled();
    });

    it('createTask: rejects creation if assignee is not a member of the project (400 Bad Request)', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const mockProjectRepo = {
        findById: vi.fn().mockResolvedValue(proj),
      } as any;
      const mockTaskRepo = {
        create: vi.fn(),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);

      await expect(
        service.createTask(member.id, 'p-1', {
          title: 'Task with invalid assignee',
          description: null,
          priority: Priority.MEDIUM,
          status: TaskStatus.TODO,
          assigneeId: outsider.id, // outsider is not a project member
          dueDate: null,
        })
      ).rejects.toThrow(BadRequestError);
      expect(mockTaskRepo.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. HTTP Integration Tests (POST /projects/:projectId/tasks)
  // =========================================================================
  describe('POST /projects/:projectId/tasks HTTP Integration', () => {
    it('returns 401 Unauthorized when request lacks authentication token', async () => {
      const res = await request(app)
        .post('/projects/p-1/tasks')
        .send({ title: 'Unauthorized Task' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 Not Found when project does not exist', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(null);

      const res = await request(app)
        .post('/projects/p-missing/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task in missing project' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('returns 403 Forbidden when authenticated user is not a member of the project', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

      const res = await request(app)
        .post('/projects/p-1/tasks')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ title: 'Intruder Task' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 422 Unprocessable Entity when title is missing or blank', async () => {
      const res = await request(app)
        .post('/projects/p-1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: '   ' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 422 Unprocessable Entity when priority is invalid', async () => {
      const res = await request(app)
        .post('/projects/p-1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task', priority: 'INVALID_PRIORITY' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 422 Unprocessable Entity when status is invalid', async () => {
      const res = await request(app)
        .post('/projects/p-1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task', status: 'UNKNOWN_STATUS' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 422 Unprocessable Entity when due_date is not valid ISO-8601', async () => {
      const res = await request(app)
        .post('/projects/p-1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task', due_date: 'tomorrow afternoon' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 Bad Request when assignee is not a member of the project', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

      const res = await request(app)
        .post('/projects/p-1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Assigning to outsider',
          assignee_id: outsider.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
    });

    it('returns 201 Created when member creates task with default priority and status', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

      const mockTask = createTaskFixture({
        title: 'Minimal Task',
        priority: Priority.MEDIUM,
        status: TaskStatus.TODO,
        assigneeId: null,
        dueDate: null,
      });
      (vi.spyOn(prisma.task, 'create') as any).mockResolvedValue(mockTask);

      const res = await request(app)
        .post('/projects/p-1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: '  Minimal Task  ',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Task created successfully');
      expect(res.body.task.title).toBe('Minimal Task');
      expect(res.body.task.priority).toBe(Priority.MEDIUM);
      expect(res.body.task.status).toBe(TaskStatus.TODO);
    });

    it('returns 201 Created when member creates task with all fields and member assignee', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

      const mockTask = createTaskFixture({
        title: 'Full Task',
        description: 'Complete task details',
        priority: Priority.HIGH,
        status: TaskStatus.IN_PROGRESS,
        assigneeId: owner.id,
        dueDate: new Date('2026-12-31T18:00:00.000Z'),
      });
      (vi.spyOn(prisma.task, 'create') as any).mockResolvedValue(mockTask);

      const res = await request(app)
        .post('/projects/p-1/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Full Task',
          description: 'Complete task details',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          assignee_id: owner.id,
          due_date: '2026-12-31T18:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Task created successfully');
      expect(res.body.task.priority).toBe('HIGH');
      expect(res.body.task.status).toBe('IN_PROGRESS');
      expect(res.body.task.assigneeId).toBe(owner.id);
    });
  });
});
