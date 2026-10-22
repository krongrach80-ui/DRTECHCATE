import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export function validate(schema: {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query) as Record<string, unknown>;
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params) as Record<string, string>;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Validation failed: ${message}`,
          },
        });
        return;
      }
      next(err);
    }
  };
}
