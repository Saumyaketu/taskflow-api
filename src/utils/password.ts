import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * Hashes a plaintext password using bcrypt with configured salt rounds
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
  return bcrypt.hash(password, salt);
};

/**
 * Compares a plaintext password against a stored bcrypt hash
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
