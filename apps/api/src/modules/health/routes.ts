import { Router, Request, Response } from 'express';

const router = Router();

router.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
  });
});

export const healthRoutes = router;
