import { Request, Response, NextFunction } from 'express';
import { AuditService } from './service';
import { AuditQueryFilterSchema } from './schema';

export class AuditController {
  constructor(private auditService = new AuditService()) {}

  getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedFilter = AuditQueryFilterSchema.parse(req.query);
      const { logs, total } = await this.auditService.query(parsedFilter);

      res.status(200).json({
        ok: true,
        data: logs,
        pagination: {
          page: parsedFilter.page,
          limit: parsedFilter.limit,
          total,
          totalPages: Math.ceil(total / parsedFilter.limit) || 1,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}
