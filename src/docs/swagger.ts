/**
 * OpenAPI 3.0.0 Specification for TaskFlow REST API
 * Defines interactive contracts, schema definitions, and security requirements.
 */
export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'TaskFlow API - Team Task Tracker',
    version: '1.0.0',
    description:
      'Production-minded Team Task Tracker REST API built with Node.js, Express, TypeScript, and Prisma ORM. Adheres to layered clean architecture with strict validation and relational data integrity.',
    contact: {
      name: 'Engineering Internship Evaluation',
      email: 'internship@axionix.dev',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local development server',
    },
    {
      url: 'http://localhost:3000/api/v1',
      description: 'Versioned API v1 base path',
    },
  ],
  tags: [
    { name: 'System', description: 'Health check and service status' },
    { name: 'Authentication', description: 'User registration, login, and JWT issuance' },
    { name: 'Projects', description: 'Project workspaces, membership association, and role guards' },
    { name: 'Tasks', description: 'Task creation, lifecycle management, pagination, and multi-criteria filters' },
    { name: 'Analytics', description: 'Project task metrics and distribution summaries' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide a valid JWT token. Example: "Bearer eyJhbGciOi..."',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'c807fb5e-2f5a-4b08-9df8-0123456789ab' },
          name: { type: 'string', example: 'Bruce Wayne' },
          email: { type: 'string', format: 'email', example: 'bruce@wayne.com' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00.000Z' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', example: 'Bruce Wayne' },
          email: { type: 'string', format: 'email', example: 'bruce@wayne.com' },
          password: { type: 'string', minLength: 8, example: 'SuperSecret123' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'bruce@wayne.com' },
          password: { type: 'string', minLength: 1, example: 'SuperSecret123' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Login successful' },
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      ProjectMember: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'pm-1' },
          projectId: { type: 'string', format: 'uuid', example: 'p-1' },
          userId: { type: 'string', format: 'uuid', example: 'c807fb5e-2f5a-4b08-9df8-0123456789ab' },
          joinedAt: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00.000Z' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      },
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'p-1' },
          name: { type: 'string', example: 'TaskFlow Core' },
          description: { type: 'string', nullable: true, example: 'Core architecture project' },
          ownerId: { type: 'string', format: 'uuid', example: 'c807fb5e-2f5a-4b08-9df8-0123456789ab' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00.000Z' },
          owner: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
          members: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProjectMember' },
          },
        },
      },
      CreateProjectRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'TaskFlow Core' },
          description: { type: 'string', maxLength: 1000, nullable: true, example: 'Core architecture project' },
        },
      },
      AddMemberRequest: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', example: 'clark@dailyplanet.com' },
        },
      },
      Priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH'],
        example: 'HIGH',
      },
      TaskStatus: {
        type: 'string',
        enum: ['TODO', 'IN_PROGRESS', 'DONE'],
        example: 'IN_PROGRESS',
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 't-1' },
          projectId: { type: 'string', format: 'uuid', example: 'p-1' },
          creatorId: { type: 'string', format: 'uuid', example: 'c807fb5e-2f5a-4b08-9df8-0123456789ab' },
          assigneeId: { type: 'string', format: 'uuid', nullable: true, example: 'b2222222-2222-2222-2222-222222222222' },
          title: { type: 'string', example: 'Implement Authentication Guard' },
          description: { type: 'string', nullable: true, example: 'Protect endpoints using JWT' },
          priority: { $ref: '#/components/schemas/Priority' },
          status: { $ref: '#/components/schemas/TaskStatus' },
          dueDate: { type: 'string', format: 'date-time', nullable: true, example: '2026-12-31T23:59:59.000Z' },
          completedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          createdAt: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00.000Z' },
          creator: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
          assignee: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      },
      CreateTaskRequest: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 255, example: 'Implement Authentication Guard' },
          description: { type: 'string', maxLength: 2000, nullable: true, example: 'Protect endpoints using JWT' },
          priority: { $ref: '#/components/schemas/Priority', default: 'MEDIUM' },
          status: { $ref: '#/components/schemas/TaskStatus', default: 'TODO' },
          assigneeId: { type: 'string', nullable: true, example: 'b2222222-2222-2222-2222-222222222222' },
          assignee_id: { type: 'string', nullable: true, description: 'Alias for assigneeId' },
          dueDate: { type: 'string', format: 'date-time', nullable: true, example: '2026-12-31T23:59:59.000Z' },
          due_date: { type: 'string', format: 'date-time', nullable: true, description: 'Alias for dueDate' },
        },
      },
      UpdateTaskRequest: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 255, example: 'Updated Task Title' },
          description: { type: 'string', maxLength: 2000, nullable: true },
          priority: { $ref: '#/components/schemas/Priority' },
          status: { $ref: '#/components/schemas/TaskStatus' },
          assigneeId: { type: 'string', nullable: true },
          assignee_id: { type: 'string', nullable: true },
          dueDate: { type: 'string', format: 'date-time', nullable: true },
          due_date: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      PaginationMetadata: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          totalPages: { type: 'integer', example: 5 },
        },
      },
      PaginatedTasksResponse: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: { $ref: '#/components/schemas/Task' },
          },
          pagination: { $ref: '#/components/schemas/PaginationMetadata' },
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          totalPages: { type: 'integer', example: 5 },
        },
      },
      ProjectSummaryResponse: {
        type: 'object',
        properties: {
          totalTasks: { type: 'integer', example: 12 },
          total: { type: 'integer', example: 12 },
          byStatus: {
            type: 'object',
            properties: {
              TODO: { type: 'integer', example: 4 },
              IN_PROGRESS: { type: 'integer', example: 5 },
              DONE: { type: 'integer', example: 3 },
            },
          },
          byPriority: {
            type: 'object',
            properties: {
              LOW: { type: 'integer', example: 2 },
              MEDIUM: { type: 'integer', example: 6 },
              HIGH: { type: 'integer', example: 4 },
            },
          },
          overdueTasks: { type: 'integer', example: 1 },
          overdue: { type: 'integer', example: 1 },
          summary: {
            type: 'object',
            properties: {
              totalTasks: { type: 'integer' },
              byStatus: { type: 'object' },
              byPriority: { type: 'object' },
              overdueTasks: { type: 'integer' },
            },
          },
        },
      },
      ErrorDetail: {
        type: 'object',
        properties: {
          field: { type: 'string', example: 'email' },
          message: { type: 'string', example: 'Invalid email address format' },
        },
      },
      ErrorEnvelope: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Validation failed' },
              details: {
                type: 'array',
                items: { $ref: '#/components/schemas/ErrorDetail' },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Service Health Check',
        description: 'Returns health status, uptime, and service identifier.',
        responses: {
          '200': {
            description: 'API service is healthy and operating normally',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'taskflow-api' },
                    timestamp: { type: 'string', format: 'date-time' },
                    uptimeSeconds: { type: 'integer', example: 120 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        description: 'Creates a new user with case-insensitive unique email and securely hashed password.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'User registered successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '400': {
            description: 'Bad request',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '409': {
            description: 'Duplicate email registration conflict',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '422': {
            description: 'Validation failed (e.g., short password or invalid email format)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'User Login & JWT Generation',
        description: 'Authenticates credentials and returns a signed JWT Bearer token with expiration claims.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful, returns token and sanitized user profile',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '401': {
            description: 'Invalid email or password (generic message prevents user enumeration)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '422': {
            description: 'Validation error on payload structure',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
    },
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List user projects',
        description: 'Retrieves all projects where the authenticated user is either the owner or a member.',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of accessible projects',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projects: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Project' },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Authentication token missing or invalid',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Create a new project workspace',
        description: 'Creates a project and automatically makes the creator both owner and initial member.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateProjectRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Project created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Project created successfully' },
                    project: { $ref: '#/components/schemas/Project' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Authentication token missing or invalid',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '422': {
            description: 'Validation error (e.g., blank project name)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
    },
    '/projects/{projectId}': {
      get: {
        tags: ['Projects'],
        summary: 'Get project details',
        description: 'Retrieves detailed project information including members and owner. Requires active membership.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Unique project UUID identifier',
          },
        ],
        responses: {
          '200': {
            description: 'Project details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    project: { $ref: '#/components/schemas/Project' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '403': {
            description: 'Caller is not a member of the project',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Delete project workspace',
        description: 'Permanently deletes project and cascades tasks and memberships. Strictly restricted to project owner.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Unique project UUID identifier',
          },
        ],
        responses: {
          '200': {
            description: 'Project deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Project deleted successfully' },
                    projectId: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '403': {
            description: 'Forbidden: only the project owner may delete the project',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
    },
    '/projects/{projectId}/members': {
      post: {
        tags: ['Projects'],
        summary: 'Add registered user to project',
        description: 'Invites an existing registered user to the project workspace using their email. Strictly restricted to owner.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AddMemberRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Member added successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Member added successfully' },
                    member: { $ref: '#/components/schemas/ProjectMember' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '403': {
            description: 'Only the project owner can add members',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '404': {
            description: 'Project or target user not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '409': {
            description: 'User is already a member of the project',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '422': {
            description: 'Validation failed on email format',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
    },
    '/projects/{projectId}/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List project tasks with pagination, sorting & filters',
        description:
          'Retrieves paginated tasks with dynamic sorting (created_at, due_date) and multi-criteria filters (status, priority, assignee, due date ranges). Accessible only to project members.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Page index (1-based)',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
            description: 'Number of items per page (default 10, maximum 50)',
          },
          {
            name: 'sort_by',
            in: 'query',
            schema: { type: 'string', enum: ['created_at', 'due_date'], default: 'created_at' },
            description: 'Field to sort tasks by',
          },
          {
            name: 'order',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            description: 'Sort ordering direction',
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by task status or comma-separated statuses (e.g. TODO or TODO,IN_PROGRESS)',
          },
          {
            name: 'priority',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by priority (e.g. HIGH or LOW,HIGH)',
          },
          {
            name: 'assigneeId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by assigned user ID',
          },
          {
            name: 'due_date_from',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            description: 'Filter tasks with due date on or after this ISO-8601 timestamp',
          },
          {
            name: 'due_date_to',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            description: 'Filter tasks with due date on or before this ISO-8601 timestamp',
          },
        ],
        responses: {
          '200': {
            description: 'Paginated and filtered task listing',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedTasksResponse' },
              },
            },
          },
          '401': {
            description: 'Unauthorized token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '403': {
            description: 'Caller is not a project member',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '422': {
            description: 'Validation error on query parameters (e.g. limit > 50 or page < 1)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Create a task under project',
        description: 'Creates a task. If assignee is provided, assignee must be an existing member of the project.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateTaskRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Task created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Task created successfully' },
                    task: { $ref: '#/components/schemas/Task' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Assignee is not a project member',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '401': {
            description: 'Unauthorized token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '403': {
            description: 'Caller is not a project member',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '422': {
            description: 'Validation failure (e.g., blank title, invalid priority/status enum)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
    },
    '/tasks/{taskId}': {
      patch: {
        tags: ['Tasks'],
        summary: 'Partially update task & manage completion lifecycle',
        description:
          'Updates title, description, priority, status, assignee, or dueDate. If status changes to DONE, completed_at is automatically stamped. If reopened, completed_at is cleared to null.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateTaskRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Task updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Task updated successfully' },
                    task: { $ref: '#/components/schemas/Task' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Assignee is not a member of the project',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '401': {
            description: 'Unauthorized token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '403': {
            description: 'Caller is not a member of the task project',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '404': {
            description: 'Task or project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '422': {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
      delete: {
        tags: ['Tasks'],
        summary: 'Delete task with dual creator-or-owner authorization',
        description:
          'Permanently deletes a task. Strictly restricted to either the task creator OR the project owner. Non-authorized members receive 403 Forbidden.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Task deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Task deleted successfully' },
                    taskId: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '403': {
            description: 'Forbidden: only the project owner or task creator can delete this task',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '404': {
            description: 'Task or project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
    },
    '/projects/{projectId}/summary': {
      get: {
        tags: ['Analytics'],
        summary: 'Project task summary & distribution metrics',
        description:
          'Provides aggregated analytics for a project: total tasks, distribution grouped by status (TODO, IN_PROGRESS, DONE), distribution grouped by priority (LOW, MEDIUM, HIGH), and overdue tasks count.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Aggregated task analytics and summary distribution',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProjectSummaryResponse' },
              },
            },
          },
          '401': {
            description: 'Unauthorized token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '403': {
            description: 'Caller is not a project member',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
      },
    },
  },
};
