import { z } from 'zod';

/**
 * Validation schema for user registration requests
 * Enforces email normalization (trimmed, lowercased, valid email structure)
 * and strong password requirements (min 8 characters).
 */
export const registerSchema = z.object({
  name: z
    .string('Name is required')
    .trim()
    .min(1, 'Name cannot be blank after trimming')
    .max(100, 'Name cannot exceed 100 characters'),
  email: z
    .string('Email is required')
    .trim()
    .toLowerCase()
    .email('Invalid email address format')
    .max(255, 'Email cannot exceed 255 characters'),
  password: z
    .string('Password is required')
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Validation schema for user authentication/login requests
 */
export const loginSchema = z.object({
  email: z
    .string('Email is required')
    .trim()
    .toLowerCase()
    .email('Invalid email address format'),
  password: z
    .string('Password is required')
    .min(1, 'Password cannot be empty'),
});

export type LoginInput = z.infer<typeof loginSchema>;
