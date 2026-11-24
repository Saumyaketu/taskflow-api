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
