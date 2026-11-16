import { Pool, PoolConfig } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

// Configure PostgreSQL connection pool
const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_POOL_CONN_TIMEOUT_MS,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle database pool client', err);
});

// Configure Prisma with PostgreSQL driver adapter
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : env.NODE_ENV === 'test' ? [] : ['warn', 'error'],
});

/**
 * Validates database connectivity and measures query latency
 */
export const checkDatabaseHealth = async (): Promise<{
  isHealthy: boolean;
  latencyMs?: number;
  error?: string;
}> => {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    return { isHealthy: true, latencyMs };
  } catch (error) {
    return {
      isHealthy: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
};

/**
 * Disconnects Prisma client and terminates the connection pool
 */
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    await pool.end();
  } catch (error) {
    console.error('Error disconnecting database connection pool:', error);
  }
};
