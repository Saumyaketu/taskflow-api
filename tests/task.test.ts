import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { generateToken } from '../src/utils/jwt.js';
import {
  createTaskSchema,
  updateTaskSchema,
  isoDateTimeSchema,
  isoDateOnlySchema,
  iso8601DateSchema,
  taskIdParamSchema,
} from '../src/schemas/task.schema.js';
import { TaskRepository } from '../src/repositories/task.repository.js';
import { TaskService } from '../src/services/task.service.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../src/errors/AppError.js';
import { Priority, TaskStatus } from '@prisma/client';

describe('Task Management Engine & Lifecycle Suite', () => {
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
    it('iso8601DateSchema, isoDateTimeSchema, isoDateOnlySchema: validate ISO date & datetime formats using native Zod schemas', () => {
      expect(isoDateOnlySchema.parse('2026-12-31')).toBe('2026-12-31');
      expect(isoDateTimeSchema.parse('2026-12-31T23:59:59.000Z')).toBe('2026-12-31T23:59:59.000Z');
      expect(iso8601DateSchema.parse('2026-12-31')).toBe('2026-12-31');
      expect(iso8601DateSchema.parse('2026-12-31T23:59:59.000Z')).toBe('2026-12-31T23:59:59.000Z');
      expect(() => isoDateOnlySchema.parse('not-a-date')).toThrow();
      expect(() => isoDateTimeSchema.parse('not-a-date')).toThrow();
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
      ).toThrow(/Invalid ISO (datetime|date)|Invalid input/);
    });

    it('updateTaskSchema: accepts partial updates and normalizes aliases', () => {
      const p1 = updateTaskSchema.parse({ title: '  Updated Title  ' });
      expect(p1).toEqual({ title: 'Updated Title' });

      const p2 = updateTaskSchema.parse({});
      expect(p2).toEqual({});

      const p3 = updateTaskSchema.parse({
        priority: 'LOW',
        status: 'DONE',
        assignee_id: member.id,
        due_date: '2026-12-31T20:00:00.000Z',
      });
      expect(p3.priority).toBe(Priority.LOW);
      expect(p3.status).toBe(TaskStatus.DONE);
      expect(p3.assigneeId).toBe(member.id);
      expect(p3.dueDate).toBeInstanceOf(Date);
    });

    it('updateTaskSchema: rejects empty or blank title when provided', () => {
      expect(() => updateTaskSchema.parse({ title: '' })).toThrow(/cannot be blank/);
      expect(() => updateTaskSchema.parse({ title: '   ' })).toThrow(/cannot be blank/);
    });

    it('updateTaskSchema: rejects invalid priority, status, and due_date format', () => {
      expect(() => updateTaskSchema.parse({ priority: 'INVALID' })).toThrow(/LOW.*MEDIUM.*HIGH/);
      expect(() => updateTaskSchema.parse({ status: 'INVALID' })).toThrow(/TODO.*IN_PROGRESS.*DONE/);
      expect(() => updateTaskSchema.parse({ due_date: 'invalid-date' })).toThrow(/Invalid ISO (datetime|date)|Invalid input/);
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

    it('update: delegates to Prisma task.update with provided partial fields and relations', async () => {
      const updatedMock = createTaskFixture({ title: 'Updated Name', status: TaskStatus.DONE });
      const mockDb = {
        task: {
          update: vi.fn().mockResolvedValue(updatedMock),
        },
      } as any;

      const repo = new TaskRepository(mockDb);
      const res = await repo.update('t-1', { title: 'Updated Name', status: TaskStatus.DONE });

      expect(mockDb.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't-1' },
          data: { title: 'Updated Name', status: TaskStatus.DONE },
        })
      );
      expect(res.title).toBe('Updated Name');
      expect(res.status).toBe(TaskStatus.DONE);
    });

    it('delete: delegates to Prisma task.delete with target taskId', async () => {
      const mockDb = {
        task: {
          delete: vi.fn().mockResolvedValue(createTaskFixture()),
        },
      } as any;

      const repo = new TaskRepository(mockDb);
      await repo.delete('t-1');

      expect(mockDb.task.delete).toHaveBeenCalledWith({
        where: { id: 't-1' },
      });
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

    it('updateTask: successfully updates task fields for project member', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const existing = createTaskFixture({ status: TaskStatus.TODO, completedAt: null });
      const mockProjectRepo = {
        findById: vi.fn().mockResolvedValue(proj),
      } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockImplementation(async (_id, data) => createTaskFixture({ ...existing, ...data })),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      const res = await service.updateTask(member.id, 't-1', {
        title: 'New Title',
        priority: Priority.LOW,
      });

      expect(res.title).toBe('New Title');
      expect(res.priority).toBe(Priority.LOW);
    });

    it('updateTask: rejects if task does not exist (404 Not Found)', async () => {
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      } as any;

      const service = new TaskService(mockTaskRepo);
      await expect(service.updateTask(member.id, 't-missing', { title: 'New' })).rejects.toThrow(NotFoundError);
      expect(mockTaskRepo.update).not.toHaveBeenCalled();
    });

    it('updateTask: rejects if caller is not a member of the task project (403 Forbidden)', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const existing = createTaskFixture({ projectId: 'p-1' });
      const mockProjectRepo = {
        findById: vi.fn().mockResolvedValue(proj),
      } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn(),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      await expect(service.updateTask(outsider.id, 't-1', { title: 'New' })).rejects.toThrow(ForbiddenError);
      expect(mockTaskRepo.update).not.toHaveBeenCalled();
    });

    it('updateTask: rejects if new assignee is not a member of the project (400 Bad Request)', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const existing = createTaskFixture({ projectId: 'p-1' });
      const mockProjectRepo = {
        findById: vi.fn().mockResolvedValue(proj),
      } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn(),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      await expect(
        service.updateTask(member.id, 't-1', { assigneeId: outsider.id })
      ).rejects.toThrow(BadRequestError);
      expect(mockTaskRepo.update).not.toHaveBeenCalled();
    });

    it('updateTask: completion lifecycle - sets completedAt when status changes to DONE', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const existing = createTaskFixture({ status: TaskStatus.TODO, completedAt: null });
      const mockProjectRepo = { findById: vi.fn().mockResolvedValue(proj) } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockImplementation(async (_id, data) => createTaskFixture({ ...existing, ...data })),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      await service.updateTask(member.id, 't-1', { status: TaskStatus.DONE });

      expect(mockTaskRepo.update).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({
          status: TaskStatus.DONE,
          completedAt: expect.any(Date),
        })
      );
    });

    it('updateTask: completion lifecycle - clears completedAt to null when task is reopened', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const existing = createTaskFixture({
        status: TaskStatus.DONE,
        completedAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      const mockProjectRepo = { findById: vi.fn().mockResolvedValue(proj) } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockImplementation(async (_id, data) => createTaskFixture({ ...existing, ...data })),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      await service.updateTask(member.id, 't-1', { status: TaskStatus.IN_PROGRESS });

      expect(mockTaskRepo.update).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({
          status: TaskStatus.IN_PROGRESS,
          completedAt: null,
        })
      );
    });

    it('updateTask: retains existing completedAt when updating other fields without changing DONE status', async () => {
      const existingCompletedAt = new Date('2026-06-01T00:00:00.000Z');
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const existing = createTaskFixture({
        status: TaskStatus.DONE,
        completedAt: existingCompletedAt,
      });
      const mockProjectRepo = { findById: vi.fn().mockResolvedValue(proj) } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockImplementation(async (_id, data) => createTaskFixture({ ...existing, ...data })),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      await service.updateTask(member.id, 't-1', { title: 'Updated Title Only' });

      expect(mockTaskRepo.update).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({
          title: 'Updated Title Only',
          completedAt: undefined,
        })
      );
    });

    it('deleteTask: allows task creator to delete task', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });
      const mockProjectRepo = { findById: vi.fn().mockResolvedValue(proj) } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(task),
        delete: vi.fn().mockResolvedValue(task),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      await service.deleteTask(member.id, 't-1');

      expect(mockTaskRepo.delete).toHaveBeenCalledWith('t-1');
    });

    it('deleteTask: allows project owner to delete task created by another member', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });
      const mockProjectRepo = { findById: vi.fn().mockResolvedValue(proj) } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(task),
        delete: vi.fn().mockResolvedValue(task),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      await service.deleteTask(owner.id, 't-1');

      expect(mockTaskRepo.delete).toHaveBeenCalledWith('t-1');
    });

    it('deleteTask: rejects non-creator, non-owner member with 403 Forbidden', async () => {
      const otherMember = createUser('d4444444-4444-4444-4444-444444444444', 'Jim Gordon', 'gordon@gcpd.gov');
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member, otherMember]);
      const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });
      const mockProjectRepo = { findById: vi.fn().mockResolvedValue(proj) } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(task),
        delete: vi.fn(),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      await expect(service.deleteTask(otherMember.id, 't-1')).rejects.toThrow(ForbiddenError);
      expect(mockTaskRepo.delete).not.toHaveBeenCalled();
    });

    it('deleteTask: rejects outsider with 403 Forbidden', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });
      const mockProjectRepo = { findById: vi.fn().mockResolvedValue(proj) } as any;
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(task),
        delete: vi.fn(),
      } as any;

      const service = new TaskService(mockTaskRepo, mockProjectRepo);
      await expect(service.deleteTask(outsider.id, 't-1')).rejects.toThrow(ForbiddenError);
      expect(mockTaskRepo.delete).not.toHaveBeenCalled();
    });

    it('deleteTask: rejects when task does not exist (404 Not Found)', async () => {
      const mockTaskRepo = {
        findById: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      } as any;

      const service = new TaskService(mockTaskRepo);
      await expect(service.deleteTask(member.id, 't-missing')).rejects.toThrow(NotFoundError);
      expect(mockTaskRepo.delete).not.toHaveBeenCalled();
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

  // =========================================================================
  // 5. HTTP Integration Tests (PATCH /tasks/:taskId)
  // =========================================================================
  describe('PATCH /tasks/:taskId HTTP Integration', () => {
    it('returns 401 Unauthorized when request lacks authentication token', async () => {
      const res = await request(app)
        .patch('/tasks/t-1')
        .send({ title: 'Unauthorized Update' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 Not Found when task does not exist', async () => {
      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(null);

      const res = await request(app)
        .patch('/tasks/t-missing')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TASK_NOT_FOUND');
    });

    it('returns 403 Forbidden when caller is not a member of the project', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const task = createTaskFixture({ projectId: 'p-1' });
      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

      const res = await request(app)
        .patch('/tasks/t-1')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ title: 'Intruder Update' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 422 Unprocessable Entity when title is blank or fields are invalid', async () => {
      const res1 = await request(app)
        .patch('/tasks/t-1')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: '   ' });
      expect(res1.status).toBe(422);

      const res2 = await request(app)
        .patch('/tasks/t-1')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ priority: 'INVALID_PRIORITY' });
      expect(res2.status).toBe(422);

      const res3 = await request(app)
        .patch('/tasks/t-1')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ status: 'INVALID_STATUS' });
      expect(res3.status).toBe(422);

      const res4 = await request(app)
        .patch('/tasks/t-1')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ due_date: 'invalid-date' });
      expect(res4.status).toBe(422);
    });

    it('returns 400 Bad Request when assignee is not a member of the project', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const task = createTaskFixture({ projectId: 'p-1' });
      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

      const res = await request(app)
        .patch('/tasks/t-1')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ assignee_id: outsider.id });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
    });

    it('returns 200 OK and sets completedAt when status is updated to DONE', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const existingTask = createTaskFixture({
        id: 't-1',
        projectId: 'p-1',
        status: TaskStatus.TODO,
        completedAt: null,
      });
      const updatedTask = createTaskFixture({
        id: 't-1',
        projectId: 'p-1',
        status: TaskStatus.DONE,
        completedAt: new Date('2026-11-24T12:00:00.000Z'),
      });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(existingTask);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
      (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(updatedTask);

      const res = await request(app)
        .patch('/tasks/t-1')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ status: 'DONE' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task updated successfully');
      expect(res.body.task.status).toBe(TaskStatus.DONE);
      expect(res.body.task.completedAt).not.toBeNull();
    });

    it('returns 200 OK and clears completedAt when task is reopened to IN_PROGRESS', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const existingTask = createTaskFixture({
        id: 't-1',
        projectId: 'p-1',
        status: TaskStatus.DONE,
        completedAt: new Date('2026-11-24T10:00:00.000Z'),
      });
      const reopenedTask = createTaskFixture({
        id: 't-1',
        projectId: 'p-1',
        status: TaskStatus.IN_PROGRESS,
        completedAt: null,
      });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(existingTask);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
      (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(reopenedTask);

      const res = await request(app)
        .patch('/tasks/t-1')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task updated successfully');
      expect(res.body.task.status).toBe(TaskStatus.IN_PROGRESS);
      expect(res.body.task.completedAt).toBeNull();
    });

    it('returns 200 OK when member updates multiple fields simultaneously', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const existingTask = createTaskFixture({ id: 't-1', projectId: 'p-1' });
      const updatedTask = createTaskFixture({
        id: 't-1',
        title: 'Refactored Pipeline',
        priority: Priority.LOW,
        assigneeId: owner.id,
      });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(existingTask);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
      (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(updatedTask);

      const res = await request(app)
        .patch('/tasks/t-1')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Refactored Pipeline',
          priority: 'LOW',
          assignee_id: owner.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task updated successfully');
      expect(res.body.task.title).toBe('Refactored Pipeline');
      expect(res.body.task.priority).toBe(Priority.LOW);
      expect(res.body.task.assigneeId).toBe(owner.id);
    });
  });

  // =========================================================================
  // 6. HTTP Integration Tests (DELETE /tasks/:taskId)
  // =========================================================================
  describe('DELETE /tasks/:taskId HTTP Integration', () => {
    it('returns 401 Unauthorized when request lacks authentication token', async () => {
      const res = await request(app).delete('/tasks/t-1');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 Not Found when task does not exist', async () => {
      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(null);

      const res = await request(app)
        .delete('/tasks/t-missing')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TASK_NOT_FOUND');
    });

    it('returns 403 Forbidden when caller is a member but neither creator nor owner', async () => {
      const otherMember = createUser('d4444444-4444-4444-4444-444444444444', 'Jim Gordon', 'gordon@gcpd.gov');
      const otherToken = generateToken({ userId: otherMember.id, email: otherMember.email });
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member, otherMember]);
      const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });

      (vi.spyOn(prisma.user, 'findUnique') as any).mockResolvedValue(otherMember);
      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

      const res = await request(app)
        .delete('/tasks/t-1')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 Forbidden when caller is an outsider', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

      const res = await request(app)
        .delete('/tasks/t-1')
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 200 OK when task creator deletes the task', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
      (vi.spyOn(prisma.task, 'delete') as any).mockResolvedValue(task);

      const res = await request(app)
        .delete('/tasks/t-1')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task deleted successfully');
      expect(res.body.taskId).toBe('t-1');
    });

    it('returns 200 OK when project owner deletes a task created by a member', async () => {
      const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
      const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
      (vi.spyOn(prisma.task, 'delete') as any).mockResolvedValue(task);

      const res = await request(app)
        .delete('/tasks/t-1')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task deleted successfully');
      expect(res.body.taskId).toBe('t-1');
    });
  });

  // =========================================================================
  // 7. Day 13: Task Lifecycle, Membership & Dual Deletion Automated Test Suite
  // =========================================================================
  describe('Day 13: Task Lifecycle, Membership & Dual Deletion Rigorous Verification', () => {
    const thirdMember = createUser('d4444444-4444-4444-4444-444444444444', 'Jim Gordon', 'gordon@gcpd.gov');
    const thirdMemberToken = generateToken({ userId: thirdMember.id, email: thirdMember.email });

    beforeEach(() => {
      (vi.spyOn(prisma.user, 'findUnique') as any).mockImplementation(async (args: any) => {
        const id = args?.where?.id;
        if (id === owner.id) return owner;
        if (id === member.id) return member;
        if (id === thirdMember.id) return thirdMember;
        if (id === outsider.id) return outsider;
        return null;
      });
    });

    describe('Scenario 1: Membership & Assignee Validation Rules', () => {
      it('rejects task creation if assignee is not a project member (400 Bad Request)', async () => {
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

        const res = await request(app)
          .post('/projects/p-1/tasks')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            title: 'Task for outsider',
            assignee_id: outsider.id,
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
        expect(res.body.error.message).toContain('Assignee must be a member of the project');
      });

      it('rejects partial patch update if new assignee is not a project member (400 Bad Request)', async () => {
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
        const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });

        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

        const res = await request(app)
          .patch('/tasks/t-1')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            assignee_id: outsider.id,
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
      });

      it('allows task creation when assigned to project owner or member', async () => {
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

        const mockTaskAssignedToOwner = createTaskFixture({
          id: 't-owner-assigned',
          assigneeId: owner.id,
          assignee: { id: owner.id, name: owner.name, email: owner.email },
        });
        (vi.spyOn(prisma.task, 'create') as any).mockResolvedValue(mockTaskAssignedToOwner);

        const res = await request(app)
          .post('/projects/p-1/tasks')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            title: 'Task assigned to Owner',
            assigneeId: owner.id,
          });

        expect(res.status).toBe(201);
        expect(res.body.task.assigneeId).toBe(owner.id);
      });
    });

    describe('Scenario 2: completed_at Dynamic Lifecycle & Status Transitions', () => {
      it('stores completed_at when status transitions to DONE from TODO', async () => {
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
        const existingTask = createTaskFixture({
          id: 't-1',
          projectId: 'p-1',
          status: TaskStatus.TODO,
          completedAt: null,
        });

        const completedDate = new Date('2026-11-24T14:00:00.000Z');
        const updatedTask = createTaskFixture({
          id: 't-1',
          projectId: 'p-1',
          status: TaskStatus.DONE,
          completedAt: completedDate,
        });

        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(existingTask);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
        const updateSpy = (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(updatedTask);

        const res = await request(app)
          .patch('/tasks/t-1')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ status: 'DONE' });

        expect(res.status).toBe(200);
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 't-1' },
            data: expect.objectContaining({
              status: TaskStatus.DONE,
              completedAt: expect.any(Date),
            }),
          })
        );
        expect(res.body.task.status).toBe(TaskStatus.DONE);
        expect(res.body.task.completedAt).toBe(completedDate.toISOString());
      });

      it('clears completed_at to null when a DONE task is reopened to TODO', async () => {
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
        const existingTask = createTaskFixture({
          id: 't-1',
          projectId: 'p-1',
          status: TaskStatus.DONE,
          completedAt: new Date('2026-11-24T12:00:00.000Z'),
        });
        const reopenedTask = createTaskFixture({
          id: 't-1',
          projectId: 'p-1',
          status: TaskStatus.TODO,
          completedAt: null,
        });

        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(existingTask);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
        const updateSpy = (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(reopenedTask);

        const res = await request(app)
          .patch('/tasks/t-1')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ status: 'TODO' });

        expect(res.status).toBe(200);
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 't-1' },
            data: expect.objectContaining({
              status: TaskStatus.TODO,
              completedAt: null,
            }),
          })
        );
        expect(res.body.task.status).toBe(TaskStatus.TODO);
        expect(res.body.task.completedAt).toBeNull();
      });

      it('clears completed_at to null when a DONE task is reopened to IN_PROGRESS', async () => {
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
        const existingTask = createTaskFixture({
          id: 't-1',
          projectId: 'p-1',
          status: TaskStatus.DONE,
          completedAt: new Date('2026-11-24T12:00:00.000Z'),
        });
        const inProgressTask = createTaskFixture({
          id: 't-1',
          projectId: 'p-1',
          status: TaskStatus.IN_PROGRESS,
          completedAt: null,
        });

        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(existingTask);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
        const updateSpy = (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(inProgressTask);

        const res = await request(app)
          .patch('/tasks/t-1')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ status: 'IN_PROGRESS' });

        expect(res.status).toBe(200);
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 't-1' },
            data: expect.objectContaining({
              status: TaskStatus.IN_PROGRESS,
              completedAt: null,
            }),
          })
        );
        expect(res.body.task.status).toBe(TaskStatus.IN_PROGRESS);
        expect(res.body.task.completedAt).toBeNull();
      });

      it('preserves completed_at when updating title/description of a DONE task without modifying status', async () => {
        const completedDate = new Date('2026-11-20T09:00:00.000Z');
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
        const existingTask = createTaskFixture({
          id: 't-1',
          projectId: 'p-1',
          status: TaskStatus.DONE,
          completedAt: completedDate,
        });
        const updatedTask = createTaskFixture({
          id: 't-1',
          projectId: 'p-1',
          title: 'Updated Done Task Title',
          status: TaskStatus.DONE,
          completedAt: completedDate,
        });

        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(existingTask);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
        const updateSpy = (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(updatedTask);

        const res = await request(app)
          .patch('/tasks/t-1')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ title: 'Updated Done Task Title' });

        expect(res.status).toBe(200);
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 't-1' },
            data: { title: 'Updated Done Task Title' },
          })
        );
        expect(res.body.task.completedAt).toBe(completedDate.toISOString());
      });
    });

    describe('Scenario 3: Non-creator / Non-owner Deletion Restrictions', () => {
      it('prevents non-creator, non-owner project member from deleting task (403 Forbidden)', async () => {
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member, thirdMember]);
        const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });

        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
        const deleteSpy = vi.spyOn(prisma.task, 'delete');

        const res = await request(app)
          .delete('/tasks/t-1')
          .set('Authorization', `Bearer ${thirdMemberToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect(res.body.error.message).toContain('Only the project owner or the task creator can delete this task');
        expect(deleteSpy).not.toHaveBeenCalled();
      });

      it('prevents assigned user (who is not creator or owner) from deleting task (403 Forbidden)', async () => {
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member, thirdMember]);
        const task = createTaskFixture({
          id: 't-1',
          projectId: 'p-1',
          creatorId: owner.id,
          assigneeId: thirdMember.id,
        });

        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
        const deleteSpy = vi.spyOn(prisma.task, 'delete');

        const res = await request(app)
          .delete('/tasks/t-1')
          .set('Authorization', `Bearer ${thirdMemberToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect(deleteSpy).not.toHaveBeenCalled();
      });

      it('prevents non-member outsider from deleting task (403 Forbidden)', async () => {
        const proj = createProjectFixture('p-1', 'Alpha', owner, [owner, member]);
        const task = createTaskFixture({ id: 't-1', projectId: 'p-1', creatorId: member.id });

        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);
        const deleteSpy = vi.spyOn(prisma.task, 'delete');

        const res = await request(app)
          .delete('/tasks/t-1')
          .set('Authorization', `Bearer ${outsiderToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect(deleteSpy).not.toHaveBeenCalled();
      });
    });

    describe('Scenario 4: Complete Multi-Step Collaboration Lifecycle E2E', () => {
      it('executes full lifecycle: create -> reject non-member -> valid update -> complete -> reopen -> unauthorized delete rejected -> owner deleted', async () => {
        const proj = createProjectFixture('p-1', 'Mission Gotham', owner, [owner, member, thirdMember]);
        (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(proj);

        // Step 1: Member creates a task assigned to owner with status TODO
        const initialTask = createTaskFixture({
          id: 't-lifecycle-1',
          projectId: 'p-1',
          creatorId: member.id,
          assigneeId: owner.id,
          title: 'Batmobile Maintenance',
          priority: Priority.HIGH,
          status: TaskStatus.TODO,
          completedAt: null,
        });
        (vi.spyOn(prisma.task, 'create') as any).mockResolvedValue(initialTask);

        const createRes = await request(app)
          .post('/projects/p-1/tasks')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            title: 'Batmobile Maintenance',
            priority: 'HIGH',
            assigneeId: owner.id,
          });

        expect(createRes.status).toBe(201);
        expect(createRes.body.task.status).toBe(TaskStatus.TODO);
        expect(createRes.body.task.completedAt).toBeNull();

        // Step 2: Member updates task to IN_PROGRESS (completedAt still null)
        const inProgressTask = { ...initialTask, status: TaskStatus.IN_PROGRESS };
        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(initialTask);
        (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(inProgressTask);

        const inProgressRes = await request(app)
          .patch('/tasks/t-lifecycle-1')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ status: 'IN_PROGRESS' });

        expect(inProgressRes.status).toBe(200);
        expect(inProgressRes.body.task.status).toBe(TaskStatus.IN_PROGRESS);
        expect(inProgressRes.body.task.completedAt).toBeNull();

        // Step 3: Member marks task as DONE -> completedAt populated
        const doneDate = new Date('2026-11-24T14:30:00.000Z');
        const doneTask = { ...initialTask, status: TaskStatus.DONE, completedAt: doneDate };
        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(inProgressTask);
        (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(doneTask);

        const doneRes = await request(app)
          .patch('/tasks/t-lifecycle-1')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ status: 'DONE' });

        expect(doneRes.status).toBe(200);
        expect(doneRes.body.task.status).toBe(TaskStatus.DONE);
        expect(doneRes.body.task.completedAt).toBe(doneDate.toISOString());

        // Step 4: Third member (not creator, not owner) attempts deletion -> 403 Forbidden
        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(doneTask);
        const forbiddenDeleteRes = await request(app)
          .delete('/tasks/t-lifecycle-1')
          .set('Authorization', `Bearer ${thirdMemberToken}`);

        expect(forbiddenDeleteRes.status).toBe(403);
        expect(forbiddenDeleteRes.body.error.code).toBe('FORBIDDEN');

        // Step 5: Owner reopens task to TODO -> completedAt cleared
        const reopenedTask = { ...initialTask, status: TaskStatus.TODO, completedAt: null };
        (vi.spyOn(prisma.task, 'update') as any).mockResolvedValue(reopenedTask);

        const reopenRes = await request(app)
          .patch('/tasks/t-lifecycle-1')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ status: 'TODO' });

        expect(reopenRes.status).toBe(200);
        expect(reopenRes.body.task.status).toBe(TaskStatus.TODO);
        expect(reopenRes.body.task.completedAt).toBeNull();

        // Step 6: Project owner deletes task -> 200 OK
        (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(reopenedTask);
        (vi.spyOn(prisma.task, 'delete') as any).mockResolvedValue(reopenedTask);

        const deleteRes = await request(app)
          .delete('/tasks/t-lifecycle-1')
          .set('Authorization', `Bearer ${ownerToken}`);

        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.message).toBe('Task deleted successfully');
        expect(deleteRes.body.taskId).toBe('t-lifecycle-1');
      });
    });
  });
});
