import jwt, { SignOptions, JwtPayload as StandardJwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface TokenPayload {
  userId: string;
  email: string;
}

export interface DecodedToken extends StandardJwtPayload, TokenPayload {}

/**
 * Signs a new JWT token containing user identity and expiration claims
 */
export const generateToken = (
  payload: TokenPayload,
  expiresIn: string | number = env.JWT_EXPIRES_IN
): string => {
  const options: SignOptions = {
    expiresIn: expiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
};

/**
 * Verifies and decodes a signed JWT token
 */
export const verifyToken = (token: string): DecodedToken => {
  return jwt.verify(token, env.JWT_SECRET) as DecodedToken;
};
