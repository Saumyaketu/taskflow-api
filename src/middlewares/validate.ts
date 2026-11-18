import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

export interface RequestValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Express middleware to validate request payload against Zod schema.
 * Replaces target payload with sanitized/transformed values (e.g., normalized email).
 */
export const validate = (schema: ZodTypeAny | RequestValidationSchemas) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if ('parseAsync' in schema) {
        req.body = await schema.parseAsync(req.body);
      } else {
        const schemas = schema as RequestValidationSchemas;
        if (schemas.body) {
          req.body = await schemas.body.parseAsync(req.body);
        }
        if (schemas.query) {
          req.query = (await schemas.query.parseAsync(req.query)) as any;
        }
        if (schemas.params) {
          req.params = (await schemas.params.parseAsync(req.params)) as any;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
