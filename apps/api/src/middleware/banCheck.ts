import { Request, Response, NextFunction } from 'express';

// In-memory cache for banned IPs (in sync with DB table 'bans')
const bannedIps = new Set<string>();

export function setBannedIps(ips: string[]): void {
  bannedIps.clear();
  ips.forEach((ip) => bannedIps.add(ip));
}

export function addBannedIp(ip: string): void {
  bannedIps.add(ip);
}

export function removeBannedIp(ip: string): void {
  bannedIps.delete(ip);
}

export function banCheck(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip || req.socket.remoteAddress || '';

  if (bannedIps.has(clientIp)) {
    res.status(403).json({
      error: {
        code: 'ACCESS_DENIED',
        message: 'Access restricted by administrator',
      },
    });
    return;
  }

  next();
}
