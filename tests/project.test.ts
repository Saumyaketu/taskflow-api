import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { generateToken } from '../src/utils/jwt.js';
import {
  createProjectSchema,
  projectIdParamSchema,
  addMemberSchema,
} from '../src/schemas/project.schema.js';
import { ProjectRepository } from '../src/repositories/project.repository.js';
import { ProjectService } from '../src/services/project.service.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../src/errors/AppError.js';

describe('Project Management & Membership Association', () => {
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
    membersList: any[] = [owner]
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

  beforeEach(() => {
    vi.restoreAllMocks();
    // Default authentication spy resolving known test users
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
  describe('Validation Schemas (createProjectSchema, projectIdParamSchema, addMemberSchema)', () => {
    it('createProjectSchema: validates and normalizes name, title alias, and description', () => {
      const p1 = createProjectSchema.parse({ name: '  Project Alpha  ', description: '  Desc  ' });
      expect(p1).toEqual({ name: 'Project Alpha', description: 'Desc' });

      const p2 = createProjectSchema.parse({ title: '  Title Alias  ', description: '   ' });
      expect(p2).toEqual({ name: 'Title Alias', description: null });

      expect(() => createProjectSchema.parse({})).toThrow(/Project name is required/);
      expect(() => createProjectSchema.parse({ name: '   ' })).toThrow(/cannot be blank/);
      expect(() => createProjectSchema.parse({ name: 'a'.repeat(151) })).toThrow(/cannot exceed 150/);
    });

    it('projectIdParamSchema: validates non-empty projectId and rejects blank', () => {
      expect(projectIdParamSchema.parse({ projectId: '  p-123  ' })).toEqual({ projectId: 'p-123' });
      expect(() => projectIdParamSchema.parse({ projectId: '   ' })).toThrow(/cannot be blank/);
      expect(() => projectIdParamSchema.parse({})).toThrow();
    });

    it('addMemberSchema: validates and normalizes email format', () => {
      expect(addMemberSchema.parse({ email: '  Robin@WAYNE.COM  ' })).toEqual({ email: 'robin@wayne.com' });
      expect(() => addMemberSchema.parse({ email: 'not-an-email' })).toThrow(/Invalid email/);
      expect(() => addMemberSchema.parse({})).toThrow();
    });
  });

  // =========================================================================
  // 2. Repository Layer Unit Tests
  // =========================================================================
  describe('ProjectRepository Unit Tests', () => {
    it('createWithMembership: executes in a transaction creating project and first member', async () => {
      const mockTx = {
        project: { create: vi.fn().mockResolvedValue({ id: 'p-1', name: 'Alpha', ownerId: owner.id }) },
        projectMember: { create: vi.fn().mockResolvedValue({ id: 'pm-1', projectId: 'p-1', userId: owner.id }) },
      };
      const mockDb = { $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)) } as any;

      const repo = new ProjectRepository(mockDb);
      const res = await repo.createWithMembership({ name: 'Alpha', ownerId: owner.id });

      expect(mockDb.$transaction).toHaveBeenCalledOnce();
      expect(mockTx.project.create).toHaveBeenCalled();
      expect(mockTx.projectMember.create).toHaveBeenCalled();
      expect(res.members).toHaveLength(1);
    });

    it('findByUserId: queries projects filtering by member membership', async () => {
      const mockDb = { project: { findMany: vi.fn().mockResolvedValue([createProjectFixture()]) } } as any;
      const repo = new ProjectRepository(mockDb);
      const res = await repo.findByUserId(owner.id);

      expect(mockDb.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { members: { some: { userId: owner.id } } } })
      );
      expect(res).toHaveLength(1);
    });

    it('findById: queries project with relations and handles database uuid errors gracefully', async () => {
      const mockDb = {
        project: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(createProjectFixture())
            .mockRejectedValueOnce({ code: 'P2023', message: 'invalid input syntax for type uuid' }),
        },
      } as any;
      const repo = new ProjectRepository(mockDb);

      const found = await repo.findById('p-1');
      expect(found?.name).toBe('TaskFlow Core');

      const invalid = await repo.findById('not-a-uuid');
      expect(invalid).toBeNull();
    });

    it('delete & isMember & addMember: operate on respective Prisma models', async () => {
      const mockDb = {
        project: { delete: vi.fn().mockResolvedValue({ id: 'p-1' }) },
        projectMember: {
          findUnique: vi.fn().mockResolvedValueOnce({ id: 'pm-1' }).mockResolvedValueOnce(null),
          create: vi.fn().mockResolvedValue({ id: 'pm-2', projectId: 'p-1', userId: member.id }),
        },
      } as any;
      const repo = new ProjectRepository(mockDb);

      await repo.delete('p-1');
      expect(mockDb.project.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });

      expect(await repo.isMember('p-1', owner.id)).toBe(true);
      expect(await repo.isMember('p-1', outsider.id)).toBe(false);

      const newMember = await repo.addMember('p-1', member.id);
      expect(newMember.id).toBe('pm-2');
    });
  });

  // =========================================================================
  // 3. Service Layer Unit Tests
  // =========================================================================
  describe('ProjectService Unit Tests', () => {
    it('createProject & getUserProjects: delegate cleanly to repository', async () => {
      const mockRepo = {
        createWithMembership: vi.fn().mockResolvedValue({ id: 'p-1' }),
        findByUserId: vi.fn().mockResolvedValue([{ id: 'p-1' }]),
      } as any;
      const service = new ProjectService(mockRepo);

      const p = await service.createProject(owner.id, { name: 'New Project', description: null });
      expect(p.id).toBe('p-1');

      const list = await service.getUserProjects(owner.id);
      expect(list).toHaveLength(1);
    });

    it('getProjectById: enforces existence and membership access control', async () => {
      const proj = createProjectFixture('p-1', 'Test', owner, [owner, member]);
      const mockRepo = {
        findById: vi.fn().mockImplementation(async (id) => (id === 'p-1' ? proj : null)),
      } as any;
      const service = new ProjectService(mockRepo);

      // Members and owner can view
      expect((await service.getProjectById(owner.id, 'p-1')).id).toBe('p-1');
      expect((await service.getProjectById(member.id, 'p-1')).id).toBe('p-1');

      // Missing project throws 404
      await expect(service.getProjectById(owner.id, 'p-missing')).rejects.toThrow(NotFoundError);

      // Outsider throws 403 Forbidden
      await expect(service.getProjectById(outsider.id, 'p-1')).rejects.toThrow(ForbiddenError);
    });

    it('deleteProject: strictly restricts deletion to project owner', async () => {
      const proj = createProjectFixture('p-1', 'Test', owner, [owner, member]);
      const mockRepo = {
        findById: vi.fn().mockImplementation(async (id) => (id === 'p-1' ? proj : null)),
        delete: vi.fn().mockResolvedValue(proj),
      } as any;
      const service = new ProjectService(mockRepo);

      // Owner can delete
      await service.deleteProject(owner.id, 'p-1');
      expect(mockRepo.delete).toHaveBeenCalledWith('p-1');

      // Non-owner member or outsider cannot delete (403 Forbidden)
      await expect(service.deleteProject(member.id, 'p-1')).rejects.toThrow(ForbiddenError);
      await expect(service.deleteProject(outsider.id, 'p-1')).rejects.toThrow(ForbiddenError);

      // Missing project throws 404
      await expect(service.deleteProject(owner.id, 'p-missing')).rejects.toThrow(NotFoundError);
    });

    it('addMember: validates project existence, owner authorization, user existence, and duplicate membership', async () => {
      const proj = createProjectFixture('p-1', 'Test', owner, [owner]);
      const mockProjectRepo = {
        findById: vi.fn().mockImplementation(async (id) => (id === 'p-1' ? proj : null)),
        isMember: vi.fn().mockImplementation(async (_pid, uid) => uid === owner.id),
        addMember: vi.fn().mockResolvedValue({ id: 'pm-new', userId: member.id }),
      } as any;

      const mockUserRepo = {
        findByEmail: vi.fn().mockImplementation(async (e) => {
          if (e === member.email) return member;
          if (e === owner.email) return owner;
          return null;
        }),
      } as any;

      const service = new ProjectService(mockProjectRepo, mockUserRepo);

      // Owner can add registered user
      const added = await service.addMember(owner.id, 'p-1', { email: member.email });
      expect(added.id).toBe('pm-new');

      // Non-owner cannot add member (403)
      await expect(service.addMember(member.id, 'p-1', { email: outsider.email })).rejects.toThrow(ForbiddenError);

      // Missing project throws 404
      await expect(service.addMember(owner.id, 'p-missing', { email: member.email })).rejects.toThrow(NotFoundError);

      // Unregistered user email throws 404
      await expect(service.addMember(owner.id, 'p-1', { email: 'unknown@email.com' })).rejects.toThrow(NotFoundError);

      // Duplicate membership throws 409 Conflict
      await expect(service.addMember(owner.id, 'p-1', { email: owner.email })).rejects.toThrow(ConflictError);
    });
  });

  // =========================================================================
  // 4. HTTP Endpoints Integration Tests (Supertest)
  // =========================================================================
  describe('HTTP REST API Integration', () => {
    // -----------------------------------------------------------------------
    // POST /projects (Creation)
    // -----------------------------------------------------------------------
    it('POST /projects: creates project with 201, accepts title alias, enforces validation & auth', async () => {
      const fixture = createProjectFixture('p-100', 'New Project', owner);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
        cb({
          project: { create: vi.fn().mockResolvedValue(fixture) },
          projectMember: { create: vi.fn().mockResolvedValue(fixture.members[0]) },
        })
      );

      // Success with name
      const res1 = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'New Project', description: 'Desc' });
      expect(res1.status).toBe(201);
      expect(res1.body.project.name).toBe('New Project');

      // Success with title alias under versioned prefix /api/v1/projects
      const res2 = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'New Project' });
      expect(res2.status).toBe(201);

      // Rejections
      const resUnauth = await request(app).post('/projects').send({ name: 'Alpha' });
      expect(resUnauth.status).toBe(401);

      const resBlank = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '   ' });
      expect(resBlank.status).toBe(422);
    });

    // -----------------------------------------------------------------------
    // GET /projects (List)
    // -----------------------------------------------------------------------
    it('GET /projects: returns user projects or empty array, enforces auth', async () => {
      vi.spyOn(prisma.project, 'findMany').mockResolvedValueOnce([createProjectFixture() as any]).mockResolvedValueOnce([]);

      const res1 = await request(app).get('/projects').set('Authorization', `Bearer ${ownerToken}`);
      expect(res1.status).toBe(200);
      expect(res1.body.projects).toHaveLength(1);

      const res2 = await request(app).get('/api/v1/projects').set('Authorization', `Bearer ${ownerToken}`);
      expect(res2.status).toBe(200);
      expect(res2.body.projects).toEqual([]);

      const resUnauth = await request(app).get('/projects');
      expect(resUnauth.status).toBe(401);
    });

    // -----------------------------------------------------------------------
    // GET /projects/:projectId (Details)
    // -----------------------------------------------------------------------
    it('GET /projects/:projectId: allows members/owner, blocks outsiders (403), returns 404 for missing', async () => {
      const proj = createProjectFixture('p-1', 'Classified', owner, [owner, member]);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockImplementation(async (args: any) =>
        args.where.id === 'p-1' ? (proj as any) : null
      );

      // Owner and Member view successfully (200)
      const resOwner = await request(app).get('/projects/p-1').set('Authorization', `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.project.name).toBe('Classified');

      const resMember = await request(app).get('/projects/p-1').set('Authorization', `Bearer ${memberToken}`);
      expect(resMember.status).toBe(200);

      // Outsider blocked (403 Forbidden)
      const resOutsider = await request(app).get('/projects/p-1').set('Authorization', `Bearer ${outsiderToken}`);
      expect(resOutsider.status).toBe(403);
      expect(resOutsider.body.error.code).toBe('FORBIDDEN');

      // Non-existent project (404 Not Found)
      const res404 = await request(app).get('/projects/p-missing').set('Authorization', `Bearer ${ownerToken}`);
      expect(res404.status).toBe(404);

      // Unauthenticated (401)
      const resUnauth = await request(app).get('/projects/p-1');
      expect(resUnauth.status).toBe(401);
    });

    // -----------------------------------------------------------------------
    // DELETE /projects/:projectId (Deletion)
    // -----------------------------------------------------------------------
    it('DELETE /projects/:projectId: restricts to owner (200), blocks members & outsiders (403), returns 404', async () => {
      const proj = createProjectFixture('p-1', 'To Delete', owner, [owner, member]);
      (vi.spyOn(prisma.project, 'findUnique') as any).mockImplementation(async (args: any) =>
        args.where.id === 'p-1' ? (proj as any) : null
      );
      vi.spyOn(prisma.project, 'delete').mockResolvedValue(proj as any);

      // Member attempts deletion -> 403 Forbidden
      const resMember = await request(app).delete('/projects/p-1').set('Authorization', `Bearer ${memberToken}`);
      expect(resMember.status).toBe(403);

      // Outsider attempts deletion -> 403 Forbidden
      const resOutsider = await request(app).delete('/projects/p-1').set('Authorization', `Bearer ${outsiderToken}`);
      expect(resOutsider.status).toBe(403);

      // Owner deletes successfully -> 200 OK
      const resOwner = await request(app).delete('/projects/p-1').set('Authorization', `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.message).toBe('Project deleted successfully');

      // Missing project -> 404
      const res404 = await request(app).delete('/projects/p-missing').set('Authorization', `Bearer ${ownerToken}`);
      expect(res404.status).toBe(404);
    });

    // -----------------------------------------------------------------------
    // POST /projects/:projectId/members (Member Invitation)
    // -----------------------------------------------------------------------
    it('POST /projects/:projectId/members: owner invites user (201), non-owner blocked (403), 404/409/422 cases handled', async () => {
      const proj = createProjectFixture('p-1', 'Team Project', owner, [owner]);

      (vi.spyOn(prisma.project, 'findUnique') as any).mockImplementation(async (args: any) =>
        args.where.id === 'p-1' ? (proj as any) : null
      );
      (vi.spyOn(prisma.user, 'findFirst') as any).mockImplementation(async (args: any) => {
        const e = args?.where?.email?.equals;
        if (e === member.email) return member;
        if (e === owner.email) return owner;
        return null;
      });
      (vi.spyOn(prisma.projectMember, 'findUnique') as any).mockImplementation(async (args: any) => {
        if (args.where.projectId_userId.userId === owner.id) return { id: 'pm-1' } as any;
        return null;
      });
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue({
        id: 'pm-2',
        projectId: 'p-1',
        userId: member.id,
        user: { id: member.id, name: member.name, email: member.email },
      } as any);

      // Owner successfully adds member -> 201 Created
      const resSuccess = await request(app)
        .post('/projects/p-1/members')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: member.email });
      expect(resSuccess.status).toBe(201);
      expect(resSuccess.body.member.userId).toBe(member.id);

      // Non-owner blocked -> 403 Forbidden
      const resForbidden = await request(app)
        .post('/projects/p-1/members')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: outsider.email });
      expect(resForbidden.status).toBe(403);

      // Target user does not exist -> 404 Not Found
      const resNotFound = await request(app)
        .post('/projects/p-1/members')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'ghost@user.com' });
      expect(resNotFound.status).toBe(404);

      // Already a member -> 409 Conflict
      const resConflict = await request(app)
        .post('/projects/p-1/members')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: owner.email });
      expect(resConflict.status).toBe(409);

      // Invalid email -> 422 Validation Error
      const resInvalid = await request(app)
        .post('/projects/p-1/members')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'not-valid' });
      expect(resInvalid.status).toBe(422);
    });
  });

  // =========================================================================
  // 5. End-to-End Membership & Access Control Enforcement Lifecycle
  // =========================================================================
  it('E2E Lifecycle: verifies creation -> unauthorized barrier -> invitation -> access grant -> deletion barrier -> owner cleanup', async () => {
    const pid = 'p-lifecycle';
    let currentMembers = [owner];

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
      cb({
        project: { create: vi.fn().mockResolvedValue(createProjectFixture(pid, 'E2E Lifecycle', owner, [owner])) },
        projectMember: { create: vi.fn().mockResolvedValue({ id: 'pm-1', projectId: pid, userId: owner.id }) },
      })
    );

    (vi.spyOn(prisma.project, 'findUnique') as any).mockImplementation(async (args: any) =>
      args.where.id === pid ? (createProjectFixture(pid, 'E2E Lifecycle', owner, currentMembers) as any) : null
    );

    (vi.spyOn(prisma.user, 'findFirst') as any).mockImplementation(async (args: any) =>
      args.where.email.equals === member.email ? member : null
    );

    (vi.spyOn(prisma.projectMember, 'findUnique') as any).mockImplementation(async (args: any) =>
      currentMembers.some((m) => m.id === args.where.projectId_userId.userId) ? ({ id: 'pm-exists' } as any) : null
    );

    (vi.spyOn(prisma.projectMember, 'create') as any).mockImplementation(async () => {
      currentMembers.push(member);
      return { id: 'pm-2', projectId: pid, userId: member.id, user: member } as any;
    });

    (vi.spyOn(prisma.project, 'delete') as any).mockImplementation(async () => {
      currentMembers = [];
      return {} as any;
    });

    // 1. Owner creates project
    const r1 = await request(app).post('/projects').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'E2E Lifecycle' });
    expect(r1.status).toBe(201);

    // 2. Member (not yet invited) blocked from viewing (403)
    const r2 = await request(app).get(`/projects/${pid}`).set('Authorization', `Bearer ${memberToken}`);
    expect(r2.status).toBe(403);

    // 3. Member blocked from inviting others (403)
    const r3 = await request(app).post(`/projects/${pid}/members`).set('Authorization', `Bearer ${memberToken}`).send({ email: outsider.email });
    expect(r3.status).toBe(403);

    // 4. Owner invites member -> 201 Created
    const r4 = await request(app).post(`/projects/${pid}/members`).set('Authorization', `Bearer ${ownerToken}`).send({ email: member.email });
    expect(r4.status).toBe(201);

    // 5. Owner re-invites member -> 409 Conflict
    const r5 = await request(app).post(`/projects/${pid}/members`).set('Authorization', `Bearer ${ownerToken}`).send({ email: member.email });
    expect(r5.status).toBe(409);

    // 6. Member can now access project -> 200 OK
    const r6 = await request(app).get(`/projects/${pid}`).set('Authorization', `Bearer ${memberToken}`);
    expect(r6.status).toBe(200);

    // 7. Member blocked from deleting project -> 403 Forbidden
    const r7 = await request(app).delete(`/projects/${pid}`).set('Authorization', `Bearer ${memberToken}`);
    expect(r7.status).toBe(403);

    // 8. Owner deletes project -> 200 OK
    const r8 = await request(app).delete(`/projects/${pid}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(r8.status).toBe(200);
  });
});
