import { z } from 'zod';
import { Priority, TaskStatus } from '@prisma/client';

/**
 * ISO-8601 validation regex supporting standard date (YYYY-MM-DD) and full ISO datetime strings
 */
const iso8601Regex = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export const iso8601DateSchema = z
  .string('due_date must be a valid ISO-8601 string')
  .trim()
  .refine(
    (val) => {
      if (!iso8601Regex.test(val)) return false;
      const parsed = new Date(val);
      return !isNaN(parsed.getTime());
    },
    {
      message: 'due_date must be a valid ISO-8601 date format',
    }
  );

/**
 * Validation schema for task creation (POST /projects/:projectId/tasks).
 * Enforces non-blank title after trimming, priority in [LOW, MEDIUM, HIGH],
 * status in [TODO, IN_PROGRESS, DONE], optional assigneeId, and optional ISO-8601 dueDate.
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
    priority: z
      .enum(['LOW', 'MEDIUM', 'HIGH'], {
        message: 'Priority must be one of: LOW, MEDIUM, HIGH',
      })
      .optional()
      .default('MEDIUM'),
    status: z
      .enum(['TODO', 'IN_PROGRESS', 'DONE'], {
        message: 'Status must be one of: TODO, IN_PROGRESS, DONE',
      })
      .optional()
      .default('TODO'),
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
      priority: data.priority as Priority,
      status: data.status as TaskStatus,
      assigneeId: rawAssignee && rawAssignee.trim().length > 0 ? rawAssignee.trim() : null,
      dueDate: rawDueDate ? new Date(rawDueDate) : null,
    };
  });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Validation schema for route parameters containing taskId (e.g. /tasks/:taskId)
 */
export const taskIdParamSchema = z.object({
  taskId: z.string().trim().min(1, 'Task ID cannot be blank'),
});

export type TaskIdParam = z.infer<typeof taskIdParamSchema>;
