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
        const parsed = schema.query.parse(req.query);
        Object.defineProperty(req, 'query', {
          value: parsed,
          writable: true,
          enumerable: true,
          configurable: true,
        });
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

export function validateBody(bodySchema: z.ZodTypeAny) {
  return validate({ body: bodySchema });
}

export function validateQuery(querySchema: z.ZodTypeAny) {
  return validate({ query: querySchema });
}

export function validateParams(paramsSchema: z.ZodTypeAny) {
  return validate({ params: paramsSchema });
}

