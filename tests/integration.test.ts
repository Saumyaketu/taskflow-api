import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { hashPassword } from '../src/utils/password.js';
import { generateToken } from '../src/utils/jwt.js';
import { Priority, TaskStatus } from '@prisma/client';

/**
 * =============================================================================
 * Comprehensive Integration Test Suite & Mandatory Rubric Verification
 * =============================================================================
 * This test suite consolidates, verifies, and demonstrates full regression compliance
 * for all 8 mandatory internship assignment evaluation scenarios:
 *
 * 1. Successful Login (HTTP 200, JWT token returned, safe user model, case-insensitive)
 * 2. Failed Login (HTTP 401 generic error envelope, no credential enumeration)
 * 3. Project Authorization Checks (Forbidden 403 access for outsiders and non-owners)
 * 4. Non-Member Assignee Rejection (HTTP 400 Bad Request if assignee is not a member)
 * 5. Multi-Criteria Task Filtering Engine (status, priority, dates, assignees)
 * 6. completed_at Lifecycle Transitions (auto timestamp on DONE, cleared on reopen)
 * 7. Task Deletion Permissions (strict dual creator-or-owner authorization)
 * 8. Pagination Boundary Checks (default 10, custom limits, max cap 50 enforcement)
 * =============================================================================
 */
describe('Comprehensive Integration Test Suite (8 Mandatory Rubric Scenarios)', () => {
  // ---------------------------------------------------------------------------
  // Reusable Test Fixtures & Mock Entities
  // ---------------------------------------------------------------------------
  const testPassword = 'Password123!';
  let passwordHash: string;

  const owner = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Bruce Wayne',
    email: 'bruce@wayne.com',
    passwordHash: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const member = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Dick Grayson',
    email: 'robin@wayne.com',
    passwordHash: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const member2 = {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Barbara Gordon',
    email: 'oracle@wayne.com',
    passwordHash: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const outsider = {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Arthur Fleck',
    email: 'joker@arkham.com',
    passwordHash: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const ownerToken = generateToken({ userId: owner.id, email: owner.email });
  const memberToken = generateToken({ userId: member.id, email: member.email });
  const member2Token = generateToken({ userId: member2.id, email: member2.email });
  const outsiderToken = generateToken({ userId: outsider.id, email: outsider.email });

  const createProjectFixture = (
    id = 'project-alpha-uuid',
    name = 'Project Alpha',
    ownerUser = owner,
    membersList = [owner, member, member2]
  ) => ({
    id,
    name,
    description: 'Mission critical project for integration testing',
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
    id: 'task-rubric-uuid-1',
    projectId: 'project-alpha-uuid',
    creatorId: member.id,
    assigneeId: member.id,
    title: 'Deploy Production Core',
    description: 'Verify deployment parameters and environment',
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

  beforeEach(async () => {
    vi.restoreAllMocks();
    if (!passwordHash) {
      passwordHash = await hashPassword(testPassword);
      owner.passwordHash = passwordHash;
      member.passwordHash = passwordHash;
      member2.passwordHash = passwordHash;
      outsider.passwordHash = passwordHash;
    }

    // Default mock for JWT auth middleware resolving known users
    (vi.spyOn(prisma.user, 'findUnique') as any).mockImplementation(async (args: any) => {
      const id = args?.where?.id;
      if (id === owner.id) return owner;
      if (id === member.id) return member;
      if (id === member2.id) return member2;
      if (id === outsider.id) return outsider;
      return null;
    });
  });

  // ===========================================================================
  // Scenario 1: Successful Login
  // ===========================================================================
  describe('Mandatory Scenario 1: Successful Login', () => {
    it('authenticates user with valid credentials, returning HTTP 200, JWT token, and safe user profile', async () => {
      (vi.spyOn(prisma.user, 'findFirst') as any).mockResolvedValue(owner);

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'bruce@wayne.com',
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.split('.').length).toBe(3); // Valid 3-part JWT structure

      // Safe user payload verification: passwordHash must NOT be leaked
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(owner.id);
      expect(res.body.user.email).toBe(owner.email);
      expect(res.body.user.name).toBe(owner.name);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.password).toBeUndefined();
    });

    it('supports case-insensitive email normalization during login', async () => {
      (vi.spyOn(prisma.user, 'findFirst') as any).mockImplementation(async (args: any) => {
        const emailFilter = args?.where?.email;
        const targetEmail = typeof emailFilter === 'string' ? emailFilter : emailFilter?.equals;
        if (targetEmail === 'bruce@wayne.com') {
          return owner;
        }
        return null;
      });

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: '  BRUCE@Wayne.COM  ',
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('bruce@wayne.com');
      expect(res.body.token).toBeDefined();
    });
  });

  // ===========================================================================
  // Scenario 2: Failed Login
  // ===========================================================================
  describe('Mandatory Scenario 2: Failed Login', () => {
    it('returns HTTP 401 Unauthorized with unified JSON error envelope on incorrect password', async () => {
      (vi.spyOn(prisma.user, 'findFirst') as any).mockResolvedValue(owner);

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'bruce@wayne.com',
          password: 'IncorrectPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
      expect(res.body.token).toBeUndefined();
    });

    it('returns HTTP 401 Unauthorized with identical generic error message on non-existent user email', async () => {
      (vi.spyOn(prisma.user, 'findFirst') as any).mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'unknown.user@wayne.com',
          password: testPassword,
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
      expect(res.body.token).toBeUndefined();
    });

    it('returns HTTP 422 Unprocessable Entity when request body violates validation schema', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'not-an-email-address',
          password: '',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Validation failed');
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });
  });

  // ===========================================================================
  // Scenario 3: Project Authorization Checks (Forbidden Access)
  // ===========================================================================
  describe('Mandatory Scenario 3: Project Authorization Checks (Forbidden Access)', () => {
    const projectFixture = createProjectFixture('project-alpha-uuid', 'Project Alpha', owner, [owner, member]);

    it('rejects non-members attempting to view project details with HTTP 403 Forbidden', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .get(`/projects/${projectFixture.id}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/not authorized|forbidden|do not have access/i);
    });

    it('rejects non-members attempting to list project tasks with HTTP 403 Forbidden', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects non-members attempting to create a task in the project with HTTP 403 Forbidden', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .post(`/projects/${projectFixture.id}/tasks`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({
          title: 'Unauthorized Task Creation',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects non-owner members attempting to invite a new member with HTTP 403 Forbidden', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .post(`/projects/${projectFixture.id}/members`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          email: outsider.email,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/only the project owner/i);
    });

    it('rejects non-owner members attempting to delete the project with HTTP 403 Forbidden', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .delete(`/projects/${projectFixture.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/only the project owner/i);
    });

    it('allows project owner full authorization to access details and manage project', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .get(`/projects/${projectFixture.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.project.id).toBe(projectFixture.id);
      expect(res.body.project.ownerId).toBe(owner.id);
    });
  });

  // ===========================================================================
  // Scenario 4: Non-Member Assignee Rejection
  // ===========================================================================
  describe('Mandatory Scenario 4: Non-Member Assignee Rejection', () => {
    const projectFixture = createProjectFixture('project-alpha-uuid', 'Project Alpha', owner, [owner, member]);

    it('rejects task creation with HTTP 400 Bad Request when assigneeId is not a project member', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .post(`/projects/${projectFixture.id}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Implement Core Feature',
          assignee_id: outsider.id, // outsider is not in project members
          priority: 'HIGH',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
      expect(res.body.error.message).toBe('Assignee must be a member of the project');
    });

    it('rejects task PATCH update with HTTP 400 Bad Request when updating assigneeId to non-member', async () => {
      const existingTask = createTaskFixture({
        id: 'task-1',
        projectId: projectFixture.id,
        creatorId: member.id,
        assigneeId: member.id,
      });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(existingTask);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .patch(`/tasks/${existingTask.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          assignee_id: outsider.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
      expect(res.body.error.message).toBe('Assignee must be a member of the project');
    });

    it('successfully creates task when assignee is a verified project member', async () => {
      const createdTask = createTaskFixture({
        id: 'task-created-valid',
        projectId: projectFixture.id,
        creatorId: owner.id,
        assigneeId: member.id,
      });

      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'create') as any).mockResolvedValue(createdTask);

      const res = await request(app)
        .post(`/projects/${projectFixture.id}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Implement Valid Assignee Flow',
          assignee_id: member.id,
          priority: 'MEDIUM',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Task created successfully');
      expect(res.body.task.assigneeId).toBe(member.id);
    });
  });

  // ===========================================================================
  // Scenario 5: Multi-Criteria Task Filtering Engine
  // ===========================================================================
  describe('Mandatory Scenario 5: Multi-Criteria Task Filtering Engine', () => {
    const projectFixture = createProjectFixture('project-alpha-uuid', 'Project Alpha', owner, [owner, member]);

    it('filters tasks by single status (e.g. IN_PROGRESS)', async () => {
      const filteredTask = createTaskFixture({ id: 't-prog', status: TaskStatus.IN_PROGRESS });

      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'count') as any).mockResolvedValue(1);
      (vi.spyOn(prisma.task, 'findMany') as any).mockResolvedValue([filteredTask]);

      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks?status=IN_PROGRESS`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBe(1);
      expect(res.body.tasks[0].status).toBe(TaskStatus.IN_PROGRESS);
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          projectId: projectFixture.id,
          status: { in: [TaskStatus.IN_PROGRESS] },
        }),
      });
    });

    it('filters tasks by multiple comma-separated statuses (e.g. TODO,DONE)', async () => {
      const task1 = createTaskFixture({ id: 't-1', status: TaskStatus.TODO });
      const task2 = createTaskFixture({ id: 't-2', status: TaskStatus.DONE, completedAt: new Date() });

      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'count') as any).mockResolvedValue(2);
      (vi.spyOn(prisma.task, 'findMany') as any).mockResolvedValue([task1, task2]);

      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks?status=TODO,DONE`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBe(2);
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: { in: [TaskStatus.TODO, TaskStatus.DONE] },
        }),
      });
    });

    it('filters tasks by priority (e.g. HIGH)', async () => {
      const highTask = createTaskFixture({ id: 't-high', priority: Priority.HIGH });

      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'count') as any).mockResolvedValue(1);
      (vi.spyOn(prisma.task, 'findMany') as any).mockResolvedValue([highTask]);

      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks?priority=HIGH`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBe(1);
      expect(res.body.tasks[0].priority).toBe(Priority.HIGH);
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          priority: { in: [Priority.HIGH] },
        }),
      });
    });

    it('filters tasks by due date range (due_date_from and due_date_to)', async () => {
      const fromDate = '2026-06-01T00:00:00.000Z';
      const toDate = '2026-06-30T23:59:59.000Z';
      const dateTask = createTaskFixture({ id: 't-date', dueDate: new Date('2026-06-15T12:00:00.000Z') });

      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'count') as any).mockResolvedValue(1);
      (vi.spyOn(prisma.task, 'findMany') as any).mockResolvedValue([dateTask]);

      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks?due_date_from=${fromDate}&due_date_to=${toDate}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBe(1);
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          dueDate: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
        }),
      });
    });

    it('filters tasks by assigned user ID', async () => {
      const assignedTask = createTaskFixture({ id: 't-assigned', assigneeId: member.id });

      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'count') as any).mockResolvedValue(1);
      (vi.spyOn(prisma.task, 'findMany') as any).mockResolvedValue([assignedTask]);

      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks?assignee_id=${member.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks[0].assigneeId).toBe(member.id);
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          assigneeId: member.id,
        }),
      });
    });

    it('supports compound filtering combining status, priority, and assignee simultaneously', async () => {
      const compoundTask = createTaskFixture({
        id: 't-compound',
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        assigneeId: member.id,
      });

      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'count') as any).mockResolvedValue(1);
      (vi.spyOn(prisma.task, 'findMany') as any).mockResolvedValue([compoundTask]);

      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks?status=TODO&priority=HIGH&assigneeId=${member.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBe(1);
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          projectId: projectFixture.id,
          status: { in: [TaskStatus.TODO] },
          priority: { in: [Priority.HIGH] },
          assigneeId: member.id,
        }),
      });
    });
  });

  // ===========================================================================
  // Scenario 6: completed_at Lifecycle Transitions
  // ===========================================================================
  describe('Mandatory Scenario 6: completed_at Lifecycle Transitions', () => {
    const projectFixture = createProjectFixture('project-alpha-uuid', 'Project Alpha', owner, [owner, member]);

    it('sets completed_at timestamp when task transitions from TODO to DONE', async () => {
      const initialTask = createTaskFixture({
        id: 'task-lifecycle-1',
        projectId: projectFixture.id,
        status: TaskStatus.TODO,
        completedAt: null,
      });

      const updatedCompletedTask = {
        ...initialTask,
        status: TaskStatus.DONE,
        completedAt: new Date('2026-06-15T15:30:00.000Z'),
        updatedAt: new Date('2026-06-15T15:30:00.000Z'),
      };

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(initialTask);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'update') as any).mockImplementation(async (args: any) => {
        expect(args.data.status).toBe(TaskStatus.DONE);
        expect(args.data.completedAt).toBeInstanceOf(Date);
        return updatedCompletedTask;
      });

      const res = await request(app)
        .patch(`/tasks/${initialTask.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          status: 'DONE',
        });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe(TaskStatus.DONE);
      expect(res.body.task.completedAt).toBe('2026-06-15T15:30:00.000Z');
    });

    it('clears completed_at back to null when reopened from DONE to IN_PROGRESS or TODO', async () => {
      const doneTask = createTaskFixture({
        id: 'task-lifecycle-1',
        projectId: projectFixture.id,
        status: TaskStatus.DONE,
        completedAt: new Date('2026-06-15T15:30:00.000Z'),
      });

      const reopenedTask = {
        ...doneTask,
        status: TaskStatus.IN_PROGRESS,
        completedAt: null,
        updatedAt: new Date('2026-06-16T10:00:00.000Z'),
      };

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(doneTask);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'update') as any).mockImplementation(async (args: any) => {
        expect(args.data.status).toBe(TaskStatus.IN_PROGRESS);
        expect(args.data.completedAt).toBeNull();
        return reopenedTask;
      });

      const res = await request(app)
        .patch(`/tasks/${doneTask.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          status: 'IN_PROGRESS',
        });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe(TaskStatus.IN_PROGRESS);
      expect(res.body.task.completedAt).toBeNull();
    });

    it('preserves existing completed_at timestamp when updating other attributes without changing DONE status', async () => {
      const fixedTimestamp = new Date('2026-06-15T15:30:00.000Z');
      const doneTask = createTaskFixture({
        id: 'task-lifecycle-1',
        projectId: projectFixture.id,
        status: TaskStatus.DONE,
        completedAt: fixedTimestamp,
      });

      const updatedTitleTask = {
        ...doneTask,
        title: 'New Title While Done',
      };

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(doneTask);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'update') as any).mockImplementation(async (args: any) => {
        expect(args.data.title).toBe('New Title While Done');
        expect(args.data.completedAt).toBeUndefined();
        return updatedTitleTask;
      });

      const res = await request(app)
        .patch(`/tasks/${doneTask.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'New Title While Done',
        });

      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe('New Title While Done');
      expect(res.body.task.completedAt).toBe('2026-06-15T15:30:00.000Z');
    });
  });

  // ===========================================================================
  // Scenario 7: Task Deletion Permissions
  // ===========================================================================
  describe('Mandatory Scenario 7: Task Deletion Permissions (Dual Creator-or-Owner Authorization)', () => {
    const projectFixture = createProjectFixture('project-alpha-uuid', 'Project Alpha', owner, [owner, member, member2]);

    it('rejects deletion with HTTP 403 Forbidden when caller is neither project owner nor task creator', async () => {
      // Task created by `member`. Caller is `member2` (co-worker member, not creator, not owner).
      const task = createTaskFixture({
        id: 'task-del-1',
        projectId: projectFixture.id,
        creatorId: member.id,
      });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .delete(`/tasks/${task.id}`)
        .set('Authorization', `Bearer ${member2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/only the project owner or the task creator can delete/i);
    });

    it('rejects deletion with HTTP 403 Forbidden when caller is an outsider non-member', async () => {
      const task = createTaskFixture({
        id: 'task-del-1',
        projectId: projectFixture.id,
        creatorId: member.id,
      });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);

      const res = await request(app)
        .delete(`/tasks/${task.id}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('successfully allows task creator (non-owner member) to delete the task with HTTP 200 OK', async () => {
      const task = createTaskFixture({
        id: 'task-del-1',
        projectId: projectFixture.id,
        creatorId: member.id,
      });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'delete') as any).mockResolvedValue(task);

      const res = await request(app)
        .delete(`/tasks/${task.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task deleted successfully');
      expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: task.id } });
    });

    it('successfully allows project owner (even if not task creator) to delete the task with HTTP 200 OK', async () => {
      const task = createTaskFixture({
        id: 'task-del-1',
        projectId: projectFixture.id,
        creatorId: member.id, // created by member, deleted by owner
      });

      (vi.spyOn(prisma.task, 'findUnique') as any).mockResolvedValue(task);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'delete') as any).mockResolvedValue(task);

      const res = await request(app)
        .delete(`/tasks/${task.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task deleted successfully');
      expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: task.id } });
    });
  });

  // ===========================================================================
  // Scenario 8: Pagination Boundary Checks (Max Limit 50)
  // ===========================================================================
  describe('Mandatory Scenario 8: Pagination Boundary Checks (Max Limit 50)', () => {
    const projectFixture = createProjectFixture('project-alpha-uuid', 'Project Alpha', owner, [owner, member]);

    it('uses default pagination values (page 1, limit 10) when query params are omitted', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'count') as any).mockResolvedValue(15);
      (vi.spyOn(prisma.task, 'findMany') as any).mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => createTaskFixture({ id: `t-def-${i + 1}` }))
      );

      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toEqual({
        total: 15,
        page: 1,
        limit: 10,
        totalPages: 2,
      });
      expect(res.body.tasks.length).toBe(10);
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        })
      );
    });

    it('accepts maximum allowed limit of 50 tasks per page and returns HTTP 200 OK', async () => {
      (vi.spyOn(prisma.project, 'findUnique') as any).mockResolvedValue(projectFixture);
      (vi.spyOn(prisma.task, 'count') as any).mockResolvedValue(50);
      (vi.spyOn(prisma.task, 'findMany') as any).mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => createTaskFixture({ id: `t-max-${i + 1}` }))
      );

      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks?limit=50`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(50);
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('rejects limit exceeding maximum boundary (> 50) with HTTP 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks?limit=51`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Validation failed');

      const limitError = res.body.error.details.find((d: any) => d.field === 'limit');
      expect(limitError).toBeDefined();
      expect(limitError.message).toMatch(/limit cannot exceed 50/i);
    });

    it('rejects zero or negative page number (< 1) with HTTP 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .get(`/projects/${projectFixture.id}/tasks?page=0`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      const pageError = res.body.error.details.find((d: any) => d.field === 'page');
      expect(pageError).toBeDefined();
      expect(pageError.message).toMatch(/page must be at least 1/i);
    });
  });
});
