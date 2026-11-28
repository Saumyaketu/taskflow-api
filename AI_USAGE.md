# AI Usage Disclosure Report

**Project**: TaskFlow API (Production-Minded Team Task Tracker REST API)  
**Author**: Saumyaketu  
**Context**: Axionix Backend Engineering Internship  


---

## 1. AI Tools Utilized

* **Antigravity (Google DeepMind / Gemini 3.8 Flash)**: Used as an interactive pair-programming assistant for architecture planning, test scenario structuring, and Dockerfile optimization.
* **ChatGPT (OpenAI GPT-4o)**: Used for quick reference queries regarding Prisma ORM v7 PostgreSQL adapter configurations and Zod schema transformation patterns.
* **GitHub Copilot**: Used for repetitive boilerplate autocomplete in test fixture definitions and type signatures.

---

## 2. Prompts & Primary Use Cases

### A. Architectural Scaffolding & 6-Phase / 20-Milestone Implementation Planning
* **Use Case**: Breaking down the internship scope into 6 core architectural phases and 20 modular increments, adhering to clean architecture.
* **Sample Prompt**:
  > "Review the Axionix Backend Engineering Internship assignment specification. I want to build a production-minded Node.js + TypeScript + Express + Prisma REST API backed by PostgreSQL. Help me design an atomic, test-driven implementation plan organized into 6 clear architectural phases:
  >  1. Architecture Baseline (scaffolding, relational schema with migrations, and centralized error handling)
  >  2. Authentication & User Identity (registration with email normalization & bcrypt, login with JWT issuance, and auth guard middleware)
  >  3. Projects & Team Membership (creation with atomic owner-membership, details query, and owner-restricted member invitation & deletion)
  >  4. Task Engine & Lifecycle (assignee membership validation, status transitions with automated completed_at lifecycle, and dual creator-or-owner deletion)
  >  5. Pagination, Filtering & Analytics (offset pagination with max cap 50, dynamic sorting, multi-criteria filters, and project summary metrics)
  >  6. Quality, Docs & Containerization (consolidated integration test suite for 8 mandatory rubric cases, interactive OpenAPI/Swagger UI + Postman collection, and multi-stage Docker + GitHub Actions CI)
  > Break these 6 phases down into 20 granular, single-concern milestones where each milestone produces working code, database models, and passing automated tests."

### B. Zod Validation Schemas & Data Normalization
* **Use Case**: Drafting robust Zod schemas supporting case-insensitive email normalization, ISO-8601 date parsing, and snake_case alias support.
* **Sample Prompt**:
  > *"Create a Zod schema for task listing query parameters supporting pagination (page, limit capped at 50), dynamic sorting (created_at, due_date), and multi-criteria filters (status, priority, assigneeId, date range)."*

### C. Test Scenario Expansion
* **Use Case**: Generating test fixtures and edge-case permutations (e.g., duplicate member invitations, unauthorized project deletion, and lifecycle status transitions).
* **Sample Prompt**:
  > *"Generate Vitest integration test scenarios for task deletion authorization ensuring only the project owner or task creator can delete a task, and unauthorized members receive 403 Forbidden."*

### D. Multi-Stage Dockerfile & CI Pipeline
* **Use Case**: Drafting a lightweight, secure Alpine-based Dockerfile with non-root user permissions and GitHub Actions CI workflow.

---

## 3. What Was Generated vs. What Was Manually Verified & Refactored

| Component | AI Contribution | Manual Verification & Engineering Decision |
| :--- | :--- | :--- |
| **Relational Schema** | Initial draft of Prisma models and relationships. | Manually added `@map("created_at")` snake_case database mappings, composite unique indexes (`@@unique([projectId, userId])`), and verified cascade delete rules on projects. |
| **Database Pool** | Suggested using `@prisma/client` defaults. | Refactored to explicitly configure `@prisma/adapter-pg` backed by Node's `pg.Pool` with idle timeouts, connection limits (`DB_POOL_MAX`), and latency measurement probes. |
| **Password Security** | Suggested basic hashing snippet. | Enforced asynchronous `bcryptjs` with salt rounds = 10; strictly created a `toSafeUser` projection ensuring `passwordHash` is never exposed in any controller response. |
| **Dual Authorization** | Drafted ownership check for tasks. | Manually designed and implemented the dual authorization rule in `TaskService.deleteTask`: allowing *either* the task creator *or* the project owner to delete, rejecting other members with HTTP 403. |
| **Integration Suite** | Boilerplate Supertest calls. | Manually authored 8 dedicated integration scenarios in `tests/integration.test.ts` verifying exact status codes, error shapes (`{ error: { code, message } }`), and edge cases. |

---

## 4. Instances Where AI Suggestions Were Incorrect or Insufficient

### Instance 1: Flawed Date Validation via Regular Expressions
* **AI Suggestion**:  
  An AI prompt initially suggested validating ISO due dates using a custom regex:
  ```typescript
  const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
  ```
* **Why It Was Incorrect / Insufficient**:  
  1. Regular expressions validate string syntax, not calendar validity. A string like `2026-02-31` or `2026-13-99` passed the regex check, causing runtime database insertion errors.
  2. It failed to accommodate timezone offsets (e.g., `+05:30` or `-04:00`), rejecting valid ISO-8601 timestamps submitted by API clients in different locales.
* **Manual Correction Applied**:  
  Scrapped the regex approach entirely. Replaced it with native Zod schemas:
  ```typescript
  export const isoDateTimeSchema = z.string().datetime({ message: 'Invalid ISO datetime format' });
  export const isoDateOnlySchema = z.string().date('Invalid ISO date format');
  export const iso8601DateSchema = z.union([isoDateTimeSchema, isoDateOnlySchema]);
  ```
  Combined with a transformation pipeline that parses valid inputs into native JavaScript `Date` objects, ensuring 100% calendar and timezone validity before reaching the database. (Committed in Milestones 11 and 12).

---

### Instance 2: CommonJS Default Import Mismatch under Strict TypeScript ESM
* **AI Suggestion**:  
  When writing container and Swagger tests, AI generated default imports for Node built-in modules:
  ```typescript
  import fs from 'node:fs';
  import path from 'node:path';
  ```
* **Why It Was Incorrect / Insufficient**:  
  In modern TypeScript with `"module": "NodeNext"` and strict ECMAScript modules, Node's `node:fs` module does not have a default export. This caused compilation errors:
  `error TS1192: Module '"node:fs"' has no default export.`
  and `Cannot find name 'process'`.
* **Manual Correction Applied**:  
  Refactored to standard TypeScript namespace imports and explicit Node process import:
  ```typescript
  import * as fs from 'node:fs';
  import * as path from 'node:path';
  import process from 'node:process';
  ```
  This resolved all compilation flags and ensured seamless execution across both local environments and the GitHub Actions CI runner.

---

## 5. Architectural Ownership & Conclusion

AI served as an accelerator for syntax reference, boilerplate generation, and edge-case brainstorming. Every architectural decision, business logic constraint, relational schema rule, and line of code was:
1. Manually reviewed and understood.
2. Verified through **267 automated tests** running on Vitest.
3. Successfully compiled through the TypeScript compiler (`tsc --noEmit`).
4. Packaged in a containerized environment with Docker Compose.

I am fully prepared to explain, defend, or live-code modifications to any part of this system during technical evaluation.
