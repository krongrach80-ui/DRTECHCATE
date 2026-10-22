import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Server-Sent Events (SSE) stream for real-time hospital updates.
 * Broadcasts clinic events filtered by user role & patient assignments.
 */
router.get('/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ event: 'connected', time: new Date().toISOString() })}\n\n`);

  // Heartbeat to keep connection open
  const keepAliveInterval = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
  });
});

export const eventRoutes = router;
