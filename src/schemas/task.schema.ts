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
 * Helper to normalize string or string array query inputs into trimmed, uppercase string array.
 */
const normalizeQueryStringArray = (val: unknown): string[] | undefined => {
  if (val === undefined || val === null || val === '') return undefined;
  if (Array.isArray(val)) {
    const list = val.flatMap((item) => String(item).split(',')).map((s) => s.trim().toUpperCase()).filter(Boolean);
    return list.length > 0 ? list : undefined;
  }
  if (typeof val === 'string') {
    const list = val.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    return list.length > 0 ? list : undefined;
  }
  return undefined;
};

/**
 * Validation schema for query parameters when listing project tasks (GET /projects/:projectId/tasks).
 * Supports pagination (page, limit with default 10, max cap 50),
 * dynamic sorting (sort_by=created_at|due_date, order=asc|desc),
 * and multi-criteria filters (status, priority, assigneeId, due_date_from, due_date_to).
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
    status: z.union([z.string(), z.array(z.string())]).optional(),
    priority: z.union([z.string(), z.array(z.string())]).optional(),
    assigneeId: z.string().trim().optional(),
    assignee_id: z.string().trim().optional(),
    due_date_from: z
      .preprocess(
        (val) => (val === undefined || val === '' || val === null ? undefined : val),
        iso8601DateSchema.optional()
      ),
    dueDateFrom: z
      .preprocess(
        (val) => (val === undefined || val === '' || val === null ? undefined : val),
        iso8601DateSchema.optional()
      ),
    due_date_to: z
      .preprocess(
        (val) => (val === undefined || val === '' || val === null ? undefined : val),
        iso8601DateSchema.optional()
      ),
    dueDateTo: z
      .preprocess(
        (val) => (val === undefined || val === '' || val === null ? undefined : val),
        iso8601DateSchema.optional()
      ),
  })
  .superRefine((data, ctx) => {
    // 1. Sort by validation
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

    // 2. Sort order validation
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

    // 3. Status validation
    const statusArray = normalizeQueryStringArray(data.status);
    if (statusArray) {
      const validStatuses = Object.values(TaskStatus);
      const invalid = statusArray.filter((s) => !validStatuses.includes(s as any));
      if (invalid.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['status'],
          message: `status must be one or more of: ${validStatuses.join(', ')}`,
        });
      }
    }

    // 4. Priority validation
    const priorityArray = normalizeQueryStringArray(data.priority);
    if (priorityArray) {
      const validPriorities = Object.values(Priority);
      const invalid = priorityArray.filter((p) => !validPriorities.includes(p as any));
      if (invalid.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['priority'],
          message: `priority must be one or more of: ${validPriorities.join(', ')}`,
        });
      }
    }

    // 5. Due date range validation (due_date_from <= due_date_to)
    const rawFrom = data.due_date_from ?? data.dueDateFrom;
    const rawTo = data.due_date_to ?? data.dueDateTo;
    if (rawFrom && rawTo) {
      const fromDate = new Date(rawFrom);
      const toDate = new Date(
        typeof rawTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawTo)
          ? `${rawTo}T23:59:59.999Z`
          : rawTo
      );
      if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime()) && fromDate > toDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['due_date_from'],
          message: 'due_date_from cannot be after due_date_to',
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

    const statusArray = normalizeQueryStringArray(data.status);
    const statuses = statusArray ? (statusArray as TaskStatus[]) : undefined;

    const priorityArray = normalizeQueryStringArray(data.priority);
    const priorities = priorityArray ? (priorityArray as Priority[]) : undefined;

    const rawAssignee = (data.assigneeId ?? data.assignee_id)?.trim();
    const assigneeId = rawAssignee && rawAssignee.length > 0 ? rawAssignee : undefined;

    const rawFrom = data.due_date_from ?? data.dueDateFrom;
    const dueDateFrom = rawFrom ? new Date(rawFrom) : undefined;

    const rawTo = data.due_date_to ?? data.dueDateTo;
    const dueDateTo = rawTo
      ? new Date(
          typeof rawTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawTo)
            ? `${rawTo}T23:59:59.999Z`
            : rawTo
        )
      : undefined;

    return {
      page: data.page,
      limit: data.limit,
      sortBy,
      order,
      status: statuses,
      priority: priorities,
      assigneeId,
      dueDateFrom,
      dueDateTo,
    };
  });

export type ListTasksQueryInput = z.infer<typeof listTasksQuerySchema>;

