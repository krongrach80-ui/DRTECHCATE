import { Router, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { authenticate } from '../../middleware/authenticate';

export interface HospitalEvent {
  event: string;
  patientId?: string;
  responsiblePtId?: string;
  assignedPtIds?: string[];
  data: unknown;
  time?: string;
}

class HospitalEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

export const hospitalEventBus = new HospitalEventBus();

export function dispatchHospitalEvent(event: HospitalEvent): void {
  hospitalEventBus.emit('hospital_event', {
    ...event,
    time: event.time || new Date().toISOString(),
  });
}

const router = Router();

/**
 * Server-Sent Events (SSE) stream for real-time hospital updates.
 * Master Prompt v3 Section 5 (Line 146):
 * Broadcasts clinic events filtered by user role:
 * - Admin: Receives all events (all patients, staff_calls, status changes, audits)
 * - PT: Receives ONLY events for patients assigned to them (responsiblePtId or assignedPtIds), never sees other PTs' patients, never sees audits.
 */
router.get('/events', authenticate, (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const currentUser = req.user;
  if (!currentUser) {
    res.end();
    return;
  }

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ event: 'connected', role: currentUser.role, time: new Date().toISOString() })}\n\n`);

  // Event listener filtered by role & patient assignment
  const onHospitalEvent = (evt: HospitalEvent) => {
    // 1. Audit events: ADMIN only
    if (evt.event === 'audit' || evt.event === 'audit_log') {
      if (currentUser.role !== 'admin') {
        return; // Filtered out for PT
      }
    }

    // 2. Patient-specific events: Filter by PT assignment
    if (currentUser.role === 'pt') {
      if (evt.patientId || evt.responsiblePtId || evt.assignedPtIds) {
        const isAssigned =
          evt.responsiblePtId === currentUser.id ||
          (evt.assignedPtIds && evt.assignedPtIds.includes(currentUser.id));

        if (!isAssigned) {
          return; // Strictly filter out: PT must NOT receive other PTs' patient events
        }
      }
    }

    // Deliver event to client
    res.write(`event: ${evt.event}\n`);
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  hospitalEventBus.on('hospital_event', onHospitalEvent);

  // Heartbeat to keep connection alive
  const keepAliveInterval = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    hospitalEventBus.off('hospital_event', onHospitalEvent);
  });
});

export const eventRoutes = router;
