import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { swaggerDocument } from '../src/docs/swagger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

describe('Interactive OpenAPI 3.0 / Swagger UI & Documentation Suite', () => {
  describe('GET /api-docs.json & /openapi.json Endpoint', () => {
    it('serves the complete OpenAPI 3.0 specification as JSON with HTTP 200 OK', async () => {
      const res = await request(app).get('/api-docs.json');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body.openapi).toBe('3.0.0');
      expect(res.body.info.title).toBe('TaskFlow API - Team Task Tracker');
      expect(res.body.info.version).toBe('1.0.0');
    });

    it('exposes identical spec via alternative documentation routes (/api/docs.json and /openapi.json)', async () => {
      const res1 = await request(app).get('/api/docs.json');
      expect(res1.status).toBe(200);
      expect(res1.body.info.title).toBe(swaggerDocument.info.title);

      const res2 = await request(app).get('/openapi.json');
      expect(res2.status).toBe(200);
      expect(res2.body.info.title).toBe(swaggerDocument.info.title);
    });

    it('documents all required endpoints in OpenAPI paths', () => {
      const paths = swaggerDocument.paths;

      // System
      expect(paths).toHaveProperty('/health');

      // Authentication
      expect(paths).toHaveProperty('/auth/register');
      expect(paths['/auth/register']).toHaveProperty('post');
      expect(paths).toHaveProperty('/auth/login');
      expect(paths['/auth/login']).toHaveProperty('post');

      // Projects & Membership
      expect(paths).toHaveProperty('/projects');
      expect(paths['/projects']).toHaveProperty('get');
      expect(paths['/projects']).toHaveProperty('post');
      expect(paths).toHaveProperty('/projects/{projectId}');
      expect(paths['/projects/{projectId}']).toHaveProperty('get');
      expect(paths['/projects/{projectId}']).toHaveProperty('delete');
      expect(paths).toHaveProperty('/projects/{projectId}/members');
      expect(paths['/projects/{projectId}/members']).toHaveProperty('post');

      // Tasks & Lifecycle
      expect(paths).toHaveProperty('/projects/{projectId}/tasks');
      expect(paths['/projects/{projectId}/tasks']).toHaveProperty('get');
      expect(paths['/projects/{projectId}/tasks']).toHaveProperty('post');
      expect(paths).toHaveProperty('/tasks/{taskId}');
      expect(paths['/tasks/{taskId}']).toHaveProperty('patch');
      expect(paths['/tasks/{taskId}']).toHaveProperty('delete');

      // Analytics
      expect(paths).toHaveProperty('/projects/{projectId}/summary');
      expect(paths['/projects/{projectId}/summary']).toHaveProperty('get');
    });

    it('defines BearerAuth security scheme and robust component schemas', () => {
      const components = swaggerDocument.components;

      expect(components.securitySchemes).toHaveProperty('BearerAuth');
      expect(components.securitySchemes.BearerAuth.type).toBe('http');
      expect(components.securitySchemes.BearerAuth.scheme).toBe('bearer');

      const schemas = components.schemas;
      expect(schemas).toHaveProperty('User');
      expect(schemas).toHaveProperty('Project');
      expect(schemas).toHaveProperty('Task');
      expect(schemas).toHaveProperty('Priority');
      expect(schemas).toHaveProperty('TaskStatus');
      expect(schemas).toHaveProperty('PaginatedTasksResponse');
      expect(schemas).toHaveProperty('ProjectSummaryResponse');
      expect(schemas).toHaveProperty('ErrorEnvelope');
    });
  });

  describe('GET /api-docs Interactive Swagger UI HTML', () => {
    it('serves interactive Swagger UI HTML assets or redirects cleanly', async () => {
      const res = await request(app).get('/api-docs/');

      // swagger-ui-express returns 200 with HTML content for the trailing slash route
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('Swagger UI');
    });

    it('redirects /api-docs to /api-docs/ for static asset mounting', async () => {
      const res = await request(app).get('/api-docs');

      // Express/Swagger-ui-express redirects bare path to trailing slash
      expect([200, 301, 302]).toContain(res.status);
    });
  });

  describe('Exportable Postman Collection Verification (postman_collection.json)', () => {
    it('validates postman_collection.json exists and conforms to Postman Collection v2.1.0 schema', () => {
      const filePath = path.resolve(process.cwd(), 'postman_collection.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.info).toBeDefined();
      expect(parsed.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
      expect(parsed.info.name).toContain('TaskFlow');

      // Check required collection variables
      const variableKeys = parsed.variable.map((v: any) => v.key);
      expect(variableKeys).toContain('baseUrl');
      expect(variableKeys).toContain('authToken');
      expect(variableKeys).toContain('projectId');
      expect(variableKeys).toContain('taskId');

      // Verify all main functional folders exist
      const folderNames = parsed.item.map((item: any) => item.name);
      expect(folderNames.some((n: string) => n.includes('Authentication'))).toBe(true);
      expect(folderNames.some((n: string) => n.includes('Project'))).toBe(true);
      expect(folderNames.some((n: string) => n.includes('Task'))).toBe(true);
      expect(folderNames.some((n: string) => n.includes('Analytics') || n.includes('Summary'))).toBe(true);
      expect(folderNames.some((n: string) => n.includes('Error'))).toBe(true);
    });
  });
});
