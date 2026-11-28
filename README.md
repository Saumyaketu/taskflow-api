# TaskFlow API — Production-Minded Team Task Tracker REST API

[![CI Pipeline](https://github.com/Saumyaketu123/intern_Axionix/actions/workflows/ci.yml/badge.svg)](https://github.com/Saumyaketu123/intern_Axionix/actions/workflows/ci.yml)
![Node.js Version](https://img.shields.io/badge/Node.js-22.x%20%7C%2020.x-339933?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)
![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express)
![Prisma](https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Multi--stage-2496ED?logo=docker)
![Tests](https://img.shields.io/badge/Tests-267%20passing-brightgreen)

TaskFlow API is a production-grade backend service built for collaborative project and task lifecycle management. Built with **Node.js**, **Express**, **TypeScript**, and **Prisma ORM**, the system strictly adheres to layered clean architecture with robust validation, relational data integrity, JWT authentication, and interactive OpenAPI documentation.

---

## Table of Contents

1. [Architecture & Folder Structure](#1-architecture--folder-structure)
2. [Tech Stack & Justification](#2-tech-stack--justification)
3. [Prerequisites](#3-prerequisites)
4. [Environment Variables](#4-environment-variables)
5. [Quick Start (Local & Docker)](#5-quick-start-local--docker)
6. [Database Schema & Migrations](#6-database-schema--migrations)
7. [API Documentation (Swagger & Postman)](#7-api-documentation-swagger--postman)
8. [API Endpoints Reference](#8-api-endpoints-reference)
9. [Automated Testing Suite](#9-automated-testing-suite)
10. [Design Decisions & Trade-Offs](#10-design-decisions--trade-offs)
11. [Assumptions & Limitations](#11-assumptions--limitations)

---

## 1. Architecture & Folder Structure

TaskFlow API follows a strict **Layered Clean MVC / Service-Repository** architecture, ensuring total separation of concerns, testability, and maintainability:

```text
HTTP Client / Swagger / Postman
       │
       ▼
Auth & Validation Middleware (JWT Guard, Zod Schemas)
       │
       ▼
Controllers / Routes (HTTP status codes, serialization, route binding)
       │
       ▼
Service Layer (Business rules, lifecycle transitions, authorization checks)
       │
       ▼
Repository / Data Access Layer (Prisma query builders, pool management)
       │
       ▼
Relational Database (PostgreSQL 16)
```

### Folder Structure

```text
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI workflow (Build, Lint, Tests, Docker)
├── prisma/
│   ├── migrations/              # Declarative SQL baseline migrations
│   └── schema.prisma            # Relational database schema with constraints & indexes
├── src/
│   ├── config/                  # Environment loader and database connection pool
│   ├── controllers/             # Express controllers (auth, project, task)
│   ├── docs/                    # OpenAPI 3.0 specification blueprint
│   ├── errors/                  # Unified AppError hierarchy (400, 401, 403, 404, 409, 422)
│   ├── middlewares/             # JWT auth guard, schema validation, async & error handlers
│   ├── repositories/            # Data access abstractions (user, project, task)
│   ├── routes/                  # Express route definitions (versioned & root)
│   ├── schemas/                 # Zod validation schemas (ISO dates, enums, limits)
│   ├── services/                # Core business logic & authorization constraints
│   ├── types/                   # TypeScript ambient declarations
│   ├── utils/                   # Password hashing (bcrypt) and JWT utilities
│   ├── app.ts                   # Express application factory & middleware pipeline
│   └── server.ts                # Server bootstrap & graceful shutdown handler
├── tests/
│   ├── auth.test.ts             # Auth pipeline & registration tests
│   ├── ci-docker.test.ts        # Container & CI configuration tests
│   ├── database.test.ts         # Pool & health check tests
│   ├── errors.test.ts           # Centralized exception serializer tests
│   ├── health.test.ts           # Service ping tests
│   ├── integration.test.ts      # 8 Mandatory rubric evaluation scenarios
│   ├── project.test.ts          # Project workspace & membership tests
│   ├── swagger.test.ts          # OpenAPI & Postman schema verification
│   └── task.test.ts             # Task engine, pagination, filters, and summary tests
├── .dockerignore                # Docker build layer exclusions
├── .env.example                 # Environment configuration template
├── docker-compose.yml           # Multi-container orchestration (API + PostgreSQL)
├── Dockerfile                   # Optimized multi-stage production Docker image
├── package.json                 # Dependency manifests & runner scripts
├── postman_collection.json      # Importable Postman Collection v2.1.0
└── tsconfig.json                # TypeScript compiler configuration
```

### 6-Phase & 20-Milestone Modular Roadmap

To uphold high engineering rigor, avoid monolithic code dumps, and follow real-world Agile practices, the project was planned and implemented across **6 Architectural Phases and 20 Modular Increments**, each delivering atomic features, database models, and automated tests:

* **Phase 1: Architecture Baseline (Milestones 1–3)**
  * **Milestone 1**: Project Scaffolding, Environment Management & Health Probe
  * **Milestone 2**: Relational PostgreSQL Schema & Declarative Migration Pipeline
  * **Milestone 3**: Centralized Error Envelope (`AppError`) & Global Exception Handling
* **Phase 2: Authentication & User Identity (Milestones 4–6)**
  * **Milestone 4**: User Registration Endpoint with Case-Insensitive Email & Bcrypt Hashing
  * **Milestone 5**: User Login Endpoint with JWT Token Generation & Expiration Claims
  * **Milestone 6**: JWT Authentication Guard Middleware & Request Context Injection
* **Phase 3: Projects & Team Membership (Milestones 7–9)**
  * **Milestone 7**: Project Creation with Atomic Owner-Membership Transaction (`$transaction`)
  * **Milestone 8**: Single Project Details Query & Owner-Only Deletion Guard
  * **Milestone 9**: Project Member Invitation by Email & Membership Duplicate Guards
* **Phase 4: Task Engine & Lifecycle (Milestones 10–13)**
  * **Milestone 10**: Task Creation with Project Member Assignee Verification
  * **Milestone 11**: Task Patch Updates & Automated `completed_at` Lifecycle Stamping
  * **Milestone 12**: Dual Creator-or-Owner Task Deletion Authorization
  * **Milestone 13**: Task Lifecycle & Membership Integration Test Coverage
* **Phase 5: Pagination, Filtering & Analytics (Milestones 14–16)**
  * **Milestone 14**: Paginated & Dynamically Sorted Task Listing (Max Cap 50)
  * **Milestone 15**: Multi-Criteria Task Filtering Engine (Status, Priority, Assignee, Dates)
  * **Milestone 16**: Project Task Analytics & Status/Priority Distribution Metrics
* **Phase 6: Quality, Docs & Containerization (Milestones 17–20)**
  * **Milestone 17**: Consolidated Integration Suite Covering 8 Mandatory Rubric Scenarios
  * **Milestone 18**: Interactive OpenAPI/Swagger UI Documentation & Postman Collection
  * **Milestone 19**: Production Multi-Stage Dockerfile, Docker Compose & GitHub Actions CI
  * **Milestone 20**: Comprehensive Documentation, AI Usage Disclosure & Demo Recording Script

---

## 2. Tech Stack & Justification

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Language & Runtime** | TypeScript 5.7 / Node.js 22 | Compile-time safety, strict typing, modern ESM runtime. |
| **Web Framework** | Express 4.21 | Lightweight, mature, layered routing and robust middleware ecosystem. |
| **ORM & Migrations** | Prisma 7.10 + PostgreSQL Adapter | Type-safe client, declarative migrations, schema relational enforcement. |
| **Database Engine** | PostgreSQL 16 (Alpine) | Strict foreign keys, composite unique indexes, transactional integrity. |
| **Validation** | Zod 4.6 | Schema parsing, string trimming, ISO-8601 parsing, runtime guarantees. |
| **Authentication** | JWT (`jsonwebtoken`) + `bcryptjs` | Stateless authorization headers, salted one-way credential hashing. |
| **API Documentation** | Swagger UI (`swagger-ui-express`) | Interactive browser-based API testing, OpenAPI 3.0 contract. |
| **Testing Engine** | Vitest 5.0 + Supertest 7.0 | Ultra-fast execution, zero-config ESM, integration testing against Express app. |
| **Containerization** | Docker Multi-stage + Compose | Zero-friction setup, reproducible production runtime, service health checks. |

---

## 3. Prerequisites

* **Node.js**: `v20.x` or `v22.x` (LTS recommended)
* **npm**: `v10.x` or higher
* **PostgreSQL**: `v14+` (or **Docker** & **Docker Compose** installed)

---

## 4. Environment Variables

Copy the provided template to create your `.env` file:

```bash
cp .env.example .env
```

| Variable | Type | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `PORT` | Number | `3000` | HTTP port the Express server listens on. |
| `NODE_ENV` | String | `development` | Environment mode (`development`, `test`, `production`). |
| `DATABASE_URL` | String | `postgresql://postgres:postgres@localhost:5432/tracker_db?schema=public` | PostgreSQL connection string. |
| `DB_POOL_MAX` | Number | `10` | Maximum number of concurrent database pool connections. |
| `DB_POOL_IDLE_TIMEOUT_MS` | Number | `30000` | Connection idle timeout before closing (ms). |
| `DB_POOL_CONN_TIMEOUT_MS` | Number | `5000` | Timeout when establishing pool connection (ms). |
| `JWT_SECRET` | String | `min-32-chars-secret-key` | Cryptographic secret used to sign and verify JWT tokens. |
| `JWT_EXPIRES_IN` | String | `24h` | JWT token lifespan / expiration claim. |
| `BCRYPT_SALT_ROUNDS` | Number | `10` | Salt work factor for bcrypt password hashing. |

---

## 5. Quick Start (Local & Docker)

### Option A: One-Click Setup with Docker Compose (Recommended)

Spins up the PostgreSQL database and TaskFlow API in isolated containers with automated migrations:

```bash
# 1. Build and start services
docker compose up --build

# 2. Verify health in another terminal
curl http://localhost:3000/health
```

The API is immediately available at `http://localhost:3000`, and interactive Swagger documentation at `http://localhost:3000/api-docs`.

To tear down containers and volumes:
```bash
docker compose down -v
```

---

### Option B: Native Local Setup

#### 1. Install Dependencies
```bash
npm ci
```

#### 2. Configure Environment
```bash
cp .env.example .env
# Ensure DATABASE_URL points to your running PostgreSQL instance
```

#### 3. Run Database Migrations
```bash
# Generates Prisma client and executes baseline migrations
npm run prisma:generate
npm run prisma:migrate
```

#### 4. Start Development Server
```bash
npm run dev
```

The server starts at `http://localhost:3000`.

---

## 6. Database Schema & Migrations

The relational schema is enforced at the database level with foreign key constraints, unique indexes, and cascading deletes:

```text
┌──────────────┐          ┌──────────────────────┐          ┌──────────────────────┐
│    users     │ 1      * │       projects       │ 1      * │        tasks         │
├──────────────┤──────────├──────────────────────┤──────────├──────────────────────┤
│ id (PK, UUID)│ owns     │ id (PK, UUID)        │ contains │ id (PK, UUID)        │
│ name         │          │ name                 │          │ project_id (FK)      │
│ email (UQ)   │          │ description          │          │ creator_id (FK)      │
│ password_hash│          │ owner_id (FK)        │          │ assignee_id (FK, Null│
│ created_at   │          │ created_at           │          │ title                │
│ updated_at   │          │ updated_at           │          │ description          │
└──────┬───────┘          └──────────┬───────────┘          │ priority (ENUM)      │
       │                             │                      │ status (ENUM)        │
       │ 1                         1 │                      │ due_date (DateTime)  │
       │      ┌──────────────────────┘                      │ completed_at (Date)  │
       │      │ *                                           │ created_at           │
       │ *    ▼                                             │ updated_at           │
┌──────┴──────────────┐                                     └──────────────────────┘
│   project_members   │
├─────────────────────┤
│ id (PK, UUID)       │
│ project_id (FK)     │
│ user_id (FK)        │
│ joined_at           │
│ UQ(project_id, user)│
└─────────────────────┘
```

### Key Schema Guarantees:
* **Unique Emails**: Case-insensitive unique constraint on `users.email`.
* **Atomic Membership**: When a project is created, the creator is inserted into `projects` and `project_members` in a single atomic database transaction (`$transaction`).
* **Cascade Deletes**: Deleting a project cascades and cleanly removes all tasks and project memberships.

---

## 7. API Documentation (Swagger & Postman)

### Interactive Swagger UI
Visit the live interactive documentation to explore request/response schemas and execute requests directly in your browser:
* **Swagger UI Dashboard**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
* **OpenAPI 3.0 Raw Spec**: [http://localhost:3000/api-docs.json](http://localhost:3000/api-docs.json)

**How to authenticate in Swagger:**
1. Call `POST /auth/login` with your credentials and copy the returned `token`.
2. Click the green **Authorize 🔓** button at the top right of the Swagger UI.
3. Paste the token and click **Authorize**. All subsequent calls automatically send the `Bearer <token>` header.

### Postman / Bruno Collection
An importable collection conforming to **Postman Collection v2.1.0** is included in the project root:
* File: **[postman_collection.json](file:///d:/intern_Axionix/postman_collection.json)**
* Pre-configured environment variables: `baseUrl`, `authToken`, `projectId`, `taskId`.
* Automated test scripts: Automatically extract and save the `authToken` on login and `projectId` / `taskId` on creation.

---

## 8. API Endpoints Reference

All endpoints support both the root route (e.g. `/auth/login`) and the versioned route (e.g. `/api/v1/auth/login`).

### System
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Service uptime and status check | No |
| `GET` | `/api-docs` | Interactive Swagger UI | No |
| `GET` | `/api-docs.json` | OpenAPI 3.0 specification JSON | No |

### Authentication
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Register user (`name`, `email`, `password`) | No |
| `POST` | `/auth/login` | Log in user and receive JWT token | No |

### Projects & Membership
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/projects` | Create a project (creator becomes owner & member) | Yes |
| `GET` | `/projects` | List projects where user is owner or member | Yes |
| `GET` | `/projects/:projectId` | View project details and member list | Yes (Member only) |
| `POST` | `/projects/:projectId/members` | Add existing registered user by email | Yes (Owner only) |
| `DELETE` | `/projects/:projectId` | Delete project and cascade tasks | Yes (Owner only) |

### Tasks Engine & Lifecycle
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/projects/:projectId/tasks` | Create task under project (assignee must be member) | Yes (Member only) |
| `GET` | `/projects/:projectId/tasks` | List tasks (paginated, sorted, filtered) | Yes (Member only) |
| `PATCH` | `/tasks/:taskId` | Partially update task (`completed_at` lifecycle) | Yes (Member only) |
| `DELETE` | `/tasks/:taskId` | Delete task with dual creator-or-owner check | Yes (Creator/Owner) |

### Analytics & Summary
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/projects/:projectId/summary` | Distribution metrics (status, priority, overdue) | Yes (Member only) |

---

## 9. Automated Testing Suite

TaskFlow API features an automated test suite with **267 passing tests** across 9 test suites, covering unit, integration, error serialization, and end-to-end flows.

### Test Runner Commands

```bash
# Run the complete test suite (all 9 suites)
npm test

# Run the 8 mandatory rubric integration scenarios
npm run test:integration

# Run unit tests
npm run test:unit

# Run static type-checking and linter
npm run lint
```

### Coverage of 8 Mandatory Assignment Scenarios

| # | Scenario | Tested In | Key Assertions Verified |
| :--- | :--- | :--- | :--- |
| **1** | **Successful Login** | `tests/integration.test.ts` | 200 OK, valid 3-part JWT, safe user model (no `passwordHash`), case-insensitive email normalization. |
| **2** | **Failed Login** | `tests/integration.test.ts` | 401 Unauthorized, generic error message (`INVALID_CREDENTIALS`), zero credential leakage or user enumeration. |
| **3** | **Project Authorization** | `tests/integration.test.ts` | 403 Forbidden for outsiders accessing details/tasks; 403 Forbidden for non-owner members deleting project or inviting members. |
| **4** | **Non-Member Assignee Rejection** | `tests/integration.test.ts` | 400 Bad Request (`INVALID_ASSIGNEE`) when assigning a task to an outsider user who is not a member of the project. |
| **5** | **Multi-Criteria Task Filtering** | `tests/integration.test.ts` | Filtering by single status (`IN_PROGRESS`), multi-status (`TODO,DONE`), priority (`HIGH`), assignee ID, and ISO date ranges (`gte`/`lte`). |
| **6** | **`completed_at` Lifecycle** | `tests/integration.test.ts` | Transition to `DONE` automatically stamps `completed_at`; reopening to `IN_PROGRESS` or `TODO` resets `completed_at` back to `null`. |
| **7** | **Task Deletion Permissions** | `tests/integration.test.ts` | Task creator (member) can delete; project owner can delete; non-creator member and outsider are rejected with 403 Forbidden. |
| **8** | **Pagination Boundary Checks** | `tests/integration.test.ts` | Default page 1 / limit 10; max allowed limit 50; limit 51 rejected with 422 Unprocessable Entity; page 0 rejected with 422. |

---

## 10. Design Decisions & Trade-Offs

1. **Prisma with pg.Pool Adapter**:
   * *Decision*: Used `@prisma/adapter-pg` backed by Node's native `pg.Pool`.
   * *Trade-off*: Adds explicit pool configuration (`max`, `idleTimeoutMillis`, `connectionTimeoutMillis`) over Prisma's default internal connection management, but delivers granular connection pooling and protection against connection starvation during high-load spikes.

2. **Case-Insensitive Email Normalization**:
   * *Decision*: Applied `.trim().toLowerCase()` at schema validation (Zod) and repository level (`mode: 'insensitive'`).
   * *Trade-off*: Prevents duplicate account creation through casing variants (`User@domain.com` vs `user@domain.com`), ensuring secure, predictable credential verification.

3. **Strict Assignee Membership Constraint**:
   * *Decision*: Validated that any non-null `assigneeId` must already belong to the project members list before task creation or updating.
   * *Trade-off*: Requires an additional database lookup or membership check, but completely eliminates orphaned or invalid task assignments across team boundaries.

4. **Lifecycle Automation for `completed_at`**:
   * *Decision*: Implemented in the service layer (`TaskService.updateTask`) rather than database triggers.
   * *Trade-off*: Keeps business logic centralized in TypeScript code, allowing deterministic unit testing without database trigger coupling.

5. **Dual Creator-or-Owner Task Deletion Rule**:
   * *Decision*: Enforced that either the task creator OR the project owner can delete a task.
   * *Trade-off*: Gives project owners governance control while empowering task creators to manage their own work, while preventing unauthorized co-workers from deleting colleagues' tasks.

---

## 11. Assumptions & Limitations

### Assumptions
* **Past Due Dates**: Past due dates are permitted upon task creation and updates. In real project workflows, teams frequently backfill completed tasks or log delayed deadlines. Tasks whose `dueDate < now()` and `status != DONE` are automatically classified as overdue in `GET /projects/:projectId/summary`.
* **Member Discovery by Email**: Project owners add existing registered users by exact email lookup. If the user does not exist in the database, the API returns `404 Not Found` with code `USER_NOT_FOUND`.

### Known Limitations
* **Rate Limiting**: In-memory rate limiting can be added via Redis for distributed deployments.
* **Refresh Tokens**: Authentication currently utilizes stateless JWT tokens with configurable expiration (`24h`). Refresh token rotation can be introduced as a production enhancement.
* **Soft Deletes**: Deletion of projects and tasks performs clean cascading hard deletes. Soft deletion (`deleted_at` audit flags) can be introduced for enterprise audit trails.
