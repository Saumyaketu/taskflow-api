import { describe, it, expect } from 'vitest';
import { prisma, pool, checkDatabaseHealth } from '../src/config/database.js';
import { env } from '../src/config/env.js';

describe('Database Configuration & Schema Models', () => {
  it('should initialize connection pool with environment parameters', () => {
    expect(pool).toBeDefined();
    expect(pool.options.max).toBe(env.DB_POOL_MAX);
    expect(pool.options.idleTimeoutMillis).toBe(env.DB_POOL_IDLE_TIMEOUT_MS);
    expect(pool.options.connectionTimeoutMillis).toBe(env.DB_POOL_CONN_TIMEOUT_MS);
  });

  it('should initialize PrismaClient with all domain models available', () => {
    expect(prisma).toBeDefined();
    expect(prisma.user).toBeDefined();
    expect(typeof prisma.user.findMany).toBe('function');
    expect(typeof prisma.user.create).toBe('function');

    expect(prisma.project).toBeDefined();
    expect(typeof prisma.project.findMany).toBe('function');
    expect(typeof prisma.project.create).toBe('function');

    expect(prisma.projectMember).toBeDefined();
    expect(typeof prisma.projectMember.findMany).toBe('function');
    expect(typeof prisma.projectMember.create).toBe('function');

    expect(prisma.task).toBeDefined();
    expect(typeof prisma.task.findMany).toBe('function');
    expect(typeof prisma.task.create).toBe('function');
  });

  it('should provide a graceful health check function', async () => {
    expect(typeof checkDatabaseHealth).toBe('function');
    const result = await checkDatabaseHealth();
    expect(result).toHaveProperty('isHealthy');
    expect(typeof result.isHealthy).toBe('boolean');
  });
});
