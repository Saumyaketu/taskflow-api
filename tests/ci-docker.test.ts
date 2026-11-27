import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

/**
 * Automated Verification Suite for Containerization & CI Pipeline
 * Validates Dockerfile, .dockerignore, docker-compose.yml, and GitHub Actions CI workflow.
 */
describe('Containerization & CI Automation Suite', () => {
  const rootDir = process.cwd();

  describe('Multi-Stage Dockerfile', () => {
    const dockerfilePath = path.join(rootDir, 'Dockerfile');

    it('verifies Dockerfile exists in project root', () => {
      expect(fs.existsSync(dockerfilePath)).toBe(true);
    });

    it('implements optimized multi-stage build (builder -> runner)', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf-8');

      // Multi-stage verification
      expect(content).toMatch(/FROM\s+node:22-alpine\s+AS\s+builder/i);
      expect(content).toMatch(/FROM\s+node:22-alpine\s+AS\s+runner/i);

      // Builder stage operations
      expect(content).toContain('npm ci');
      expect(content).toContain('npx prisma generate');
      expect(content).toContain('npm run build');

      // Runner stage operations
      expect(content).toMatch(/COPY\s+--from=builder\s+\/app\/dist\s+\.\/dist/i);
      expect(content).toMatch(/COPY\s+--from=builder\s+\/app\/node_modules\s+\.\/node_modules/i);
    });

    it('enforces security with non-root user execution and health check probe', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf-8');

      // Non-root security context
      expect(content).toMatch(/USER\s+node/i);

      // Port exposure
      expect(content).toMatch(/EXPOSE\s+3000/i);

      // Built-in health check targeting /health
      expect(content).toContain('HEALTHCHECK');
      expect(content).toContain('/health');

      // Default CMD
      expect(content).toMatch(/CMD\s+\[.*node.*dist\/server\.js.*\]/i);
    });
  });

  describe('.dockerignore Configuration', () => {
    const dockerignorePath = path.join(rootDir, '.dockerignore');

    it('verifies .dockerignore exists and ignores unnecessary local artifacts', () => {
      expect(fs.existsSync(dockerignorePath)).toBe(true);
      const content = fs.readFileSync(dockerignorePath, 'utf-8');

      expect(content).toContain('node_modules');
      expect(content).toContain('dist');
      expect(content).toContain('.git');
      expect(content).toContain('.env');
      expect(content).toContain('coverage');
    });
  });

  describe('Docker Compose Orchestration (docker-compose.yml)', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');

    it('verifies docker-compose.yml exists in project root', () => {
      expect(fs.existsSync(composePath)).toBe(true);
    });

    it('defines PostgreSQL database service with persistent volume and health check', () => {
      const content = fs.readFileSync(composePath, 'utf-8');

      expect(content).toContain('postgres:16-alpine');
      expect(content).toContain('taskflow-postgres');
      expect(content).toContain('POSTGRES_DB: tracker_db');
      expect(content).toContain('5432:5432');
      expect(content).toContain('pg_isready -U postgres -d tracker_db');
      expect(content).toContain('postgres_data:');
    });

    it('defines API service linked with healthy PostgreSQL dependency and migration startup', () => {
      const content = fs.readFileSync(composePath, 'utf-8');

      expect(content).toContain('taskflow-api');
      expect(content).toContain('3000:3000');
      expect(content).toContain('condition: service_healthy');
      expect(content).toContain('npx prisma migrate deploy');
      expect(content).toContain('node dist/server.js');
    });
  });

  describe('GitHub Actions CI Workflow (.github/workflows/ci.yml)', () => {
    const ciPath = path.join(rootDir, '.github', 'workflows', 'ci.yml');

    it('verifies .github/workflows/ci.yml exists', () => {
      expect(fs.existsSync(ciPath)).toBe(true);
    });

    it('configures push and pull request triggers with Node 22 matrix and automated testing', () => {
      const content = fs.readFileSync(ciPath, 'utf-8');

      // Trigger conditions
      expect(content).toContain('push:');
      expect(content).toContain('pull_request:');
      expect(content).toContain('branches:');

      // Strategy & Environment
      expect(content).toContain('node-version:');
      expect(content).toContain('22.x');

      // Pipeline execution steps
      expect(content).toContain('actions/checkout@v4');
      expect(content).toContain('actions/setup-node@v4');
      expect(content).toContain('npm ci');
      expect(content).toContain('npx prisma generate');
      expect(content).toContain('npm run lint');
      expect(content).toContain('npm run build');
      expect(content).toContain('npm test');
      expect(content).toContain('npm run test:integration');
    });
  });

  describe('Linter and Static Type Checking in package.json', () => {
    const pkgPath = path.join(rootDir, 'package.json');

    it('verifies lint script is defined and executes tsc type-checking', () => {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.scripts).toHaveProperty('lint');
      expect(pkg.scripts.lint).toBe('tsc --noEmit');
    });
  });
});
