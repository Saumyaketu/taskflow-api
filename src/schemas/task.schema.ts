import { z } from 'zod';
import { Priority, TaskStatus } from '@prisma/client';

/**
 * Native Zod ISO-8601 schemas:
 * - isoDateTimeSchema: For full ISO datetime (e.g. "2026-11-24T12:13:00Z" or with timezone offsets)
 * - isoDateOnlySchema: For date-only strings (e.g. "2026-11-24")
 * - iso8601DateSchema: Union accepting either standard format
 */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const isoDateOnlySchema = z.iso.date();
export const iso8601DateSchema = z.union([isoDateTimeSchema, isoDateOnlySchema]);

/**
 * Validation schema for task creation (POST /projects/:projectId/tasks).
 * Enforces non-blank title after trimming, native Priority and TaskStatus enums,
 * optional assigneeId, and optional ISO-8601 dueDate.
 */
export const createTaskSchema = z
  .object({
    title: z
      .string('Task title is required')
      .trim()
      .min(1, 'Task title cannot be blank after trimming')
      .max(255, 'Task title cannot exceed 255 characters'),
    description: z
      .string('Description must be a string')
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .optional()
      .nullable(),
    priority: z.enum(Priority).optional().default(Priority.MEDIUM),
    status: z.enum(TaskStatus).optional().default(TaskStatus.TODO),
    assigneeId: z.string().trim().min(1, 'assigneeId cannot be empty').optional().nullable(),
    assignee_id: z.string().trim().min(1, 'assignee_id cannot be empty').optional().nullable(),
    dueDate: iso8601DateSchema.optional().nullable(),
    due_date: iso8601DateSchema.optional().nullable(),
  })
  .transform((data) => {
    const rawAssignee = data.assigneeId ?? data.assignee_id;
    const rawDueDate = data.dueDate ?? data.due_date;

    return {
      title: data.title.trim(),
      description: data.description && data.description.trim().length > 0 ? data.description.trim() : null,
      priority: data.priority,
      status: data.status,
      assigneeId: rawAssignee && rawAssignee.trim().length > 0 ? rawAssignee.trim() : null,
      dueDate: rawDueDate ? new Date(rawDueDate) : null,
    };
  });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Validation schema for partial task updates (PATCH /tasks/:taskId).
 * Allows partial modifications to title, description, priority, status, assignee, and dueDate.
 */
export const updateTaskSchema = z
  .object({
    title: z
      .string('Task title must be a string')
      .trim()
      .min(1, 'Task title cannot be blank after trimming')
      .max(255, 'Task title cannot exceed 255 characters')
      .optional(),
    description: z
      .string('Description must be a string')
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .optional()
      .nullable(),
    priority: z.enum(Priority).optional(),
    status: z.enum(TaskStatus).optional(),
    assigneeId: z.string().trim().min(1, 'assigneeId cannot be empty').optional().nullable(),
    assignee_id: z.string().trim().min(1, 'assignee_id cannot be empty').optional().nullable(),
    dueDate: iso8601DateSchema.optional().nullable(),
    due_date: iso8601DateSchema.optional().nullable(),
  })
  .transform((data) => {
    const result: {
      title?: string;
      description?: string | null;
      priority?: Priority;
      status?: TaskStatus;
      assigneeId?: string | null;
      dueDate?: Date | null;
    } = {};

    if (data.title !== undefined) {
      result.title = data.title.trim();
    }
    if (data.description !== undefined) {
      result.description =
        data.description && data.description.trim().length > 0 ? data.description.trim() : null;
    }
    if (data.priority !== undefined) {
      result.priority = data.priority;
    }
    if (data.status !== undefined) {
      result.status = data.status;
    }

    const rawAssignee = data.assigneeId !== undefined ? data.assigneeId : data.assignee_id;
    if (rawAssignee !== undefined) {
      result.assigneeId = rawAssignee && rawAssignee.trim().length > 0 ? rawAssignee.trim() : null;
    }

    const rawDueDate = data.dueDate !== undefined ? data.dueDate : data.due_date;
    if (rawDueDate !== undefined) {
      result.dueDate = rawDueDate ? new Date(rawDueDate) : null;
    }

    return result;
  });

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/**
 * Validation schema for route parameters containing taskId (e.g. /tasks/:taskId)
 */
export const taskIdParamSchema = z.object({
  taskId: z.string().trim().min(1, 'Task ID cannot be blank'),
});

export type TaskIdParam = z.infer<typeof taskIdParamSchema>;

/**
 * Validation schema for query parameters when listing project tasks (GET /projects/:projectId/tasks).
 * Supports pagination (page, limit with default 10, max cap 50)
 * and dynamic sorting (sort_by=created_at|due_date, order=asc|desc).
 */
export const listTasksQuerySchema = z
  .object({
    page: z
      .preprocess(
        (val) => (val === undefined || val === '' ? 1 : Number(val)),
        z
          .number('page must be an integer')
          .int('page must be an integer')
          .min(1, 'page must be at least 1')
      )
      .default(1),
    limit: z
      .preprocess(
        (val) => (val === undefined || val === '' ? 10 : Number(val)),
        z
          .number('limit must be an integer')
          .int('limit must be an integer')
          .min(1, 'limit must be at least 1')
          .max(50, 'limit cannot exceed 50')
      )
      .default(10),
    sort_by: z.string().trim().optional(),
    sortBy: z.string().trim().optional(),
    order: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const rawSortBy = data.sort_by ?? data.sortBy;
    if (rawSortBy !== undefined && rawSortBy !== '') {
      const normalized = rawSortBy.toLowerCase();
      if (!['created_at', 'due_date', 'createdat', 'duedate'].includes(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sort_by'],
          message: "sort_by must be one of: 'created_at', 'due_date'",
        });
      }
    }
    if (data.order !== undefined && data.order !== '') {
      const normalizedOrder = data.order.toLowerCase();
      if (!['asc', 'desc'].includes(normalizedOrder)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['order'],
          message: "order must be either 'asc' or 'desc'",
        });
      }
    }
  })
  .transform((data) => {
    const rawSortBy = (data.sort_by ?? data.sortBy)?.toLowerCase();
    let sortBy: 'createdAt' | 'dueDate' = 'createdAt';
    if (rawSortBy === 'due_date' || rawSortBy === 'duedate') {
      sortBy = 'dueDate';
    }

    const rawOrder = data.order?.toLowerCase();
    const order: 'asc' | 'desc' = rawOrder === 'desc' ? 'desc' : 'asc';

    return {
      page: data.page,
      limit: data.limit,
      sortBy,
      order,
    };
  });

export type ListTasksQueryInput = z.infer<typeof listTasksQuerySchema>;

