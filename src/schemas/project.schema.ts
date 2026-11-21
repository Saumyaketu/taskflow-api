import { z } from 'zod';

/**
 * Validation schema for project creation (POST /projects).
 * Enforces non-blank name/title after trimming and optional description.
 * Supports both `name` and `title` fields for compatibility, normalizing to `name`.
 */
export const createProjectSchema = z
  .object({
    name: z
      .string('Project name must be a string')
      .trim()
      .min(1, 'Project name cannot be blank after trimming')
      .max(150, 'Project name cannot exceed 150 characters')
      .optional(),
    title: z
      .string('Project title must be a string')
      .trim()
      .min(1, 'Project title cannot be blank after trimming')
      .max(150, 'Project title cannot exceed 150 characters')
      .optional(),
    description: z
      .string('Description must be a string')
      .trim()
      .max(1000, 'Description cannot exceed 1000 characters')
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    const rawName = data.name ?? data.title;
    if (rawName === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Project name is required',
        path: ['name'],
      });
    }
  })
  .transform((data) => {
    const resolvedName = (data.name ?? data.title)!.trim();
    const resolvedDescription =
      data.description !== undefined && data.description !== null && data.description.trim().length > 0
        ? data.description.trim()
        : null;

    return {
      name: resolvedName,
      description: resolvedDescription,
    };
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
