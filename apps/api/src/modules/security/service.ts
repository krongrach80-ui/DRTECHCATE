import { AppError } from '../../middleware/errorHandler';
import { getEnv } from '../../config/env';
import { UserSession } from '../../middleware/authenticate';
import { addActiveBan, removeActiveBan, syncActiveBans } from '../../middleware/banCheck';
import { audit } from '../audit';
import { SecurityRepository, defaultSecurityRepository } from './repository';
import { BanCreateInput, BanRecord, BanQueryFilter } from './schema';

export class SecurityService {
  constructor(private repo: SecurityRepository = defaultSecurityRepository) {}

  /**
   * Helper to check if an IP matches the hospital allowlist or loopback.
   */
  private isHospitalOrLoopbackIp(ip: string, allowlistStr: string): boolean {
    const cleanIp = ip.trim().toLowerCase().replace(/^::ffff:/, '');
    const allowlist = allowlistStr
      .split(',')
      .map((item) => item.trim().toLowerCase().replace(/^::ffff:/, ''))
      .filter(Boolean);

    // Default loopbacks always protected
    const builtInHospitalIps = new Set(['127.0.0.1', '::1', 'localhost', '0.0.0.0']);

    if (builtInHospitalIps.has(cleanIp)) {
      return true;
    }

    return allowlist.includes(cleanIp);
  }

  /**
   * Creates a security ban (IP, Device, or Account).
   * Refuses to ban hospital/NAT IPs or the calling admin's own IP/account/device.
   */
  async createBan(
    input: BanCreateInput,
    adminUser: UserSession,
    clientIp: string,
    clientDeviceId?: string
  ): Promise<BanRecord> {
    const rawIp = clientIp.trim().toLowerCase().replace(/^::ffff:/, '');
    const targetValue = input.value.trim();

    // 1. IP Ban Checks
    if (input.type === 'ip') {
      let hospitalIpsSetting = process.env.HOSPITAL_IPS || '127.0.0.1,::1,localhost';
      try {
        if (!process.env.HOSPITAL_IPS) {
          hospitalIpsSetting = getEnv().HOSPITAL_IPS;
        }
      } catch {
        // fallback
      }

      if (this.isHospitalOrLoopbackIp(targetValue, hospitalIpsSetting)) {
        throw new AppError(
          'Cannot ban hospital or NAT IP address. Address is protected by allowlist.',
          400,
          'CANNOT_BAN_HOSPITAL_IP'
        );
      }

      const normalizedTarget = targetValue.toLowerCase().replace(/^::ffff:/, '');
      if (normalizedTarget === rawIp) {
        throw new AppError(
          'Cannot ban your own current IP address.',
          400,
          'CANNOT_BAN_SELF'
        );
      }
    }

    // 2. Account Ban Checks
    if (input.type === 'account') {
      if (targetValue === adminUser.id) {
        throw new AppError(
          'Cannot ban your own administrator account.',
          400,
          'CANNOT_BAN_SELF'
        );
      }
    }

    // 3. Device Ban Checks
    if (input.type === 'device') {
      if (clientDeviceId && targetValue === clientDeviceId.trim()) {
        throw new AppError(
          'Cannot ban your own current device.',
          400,
          'CANNOT_BAN_SELF'
        );
      }
    }

    // 4. Persist in DB
    const ban = await this.repo.createBan({
      type: input.type,
      value: targetValue,
      reason: input.reason || null,
      expires_at: input.expires_at || null,
      created_by: adminUser.id,
    });

    // 5. Update in-memory active ban cache
    addActiveBan(ban.type, ban.value, ban.expires_at);

    // 6. Audit Trail
    await audit.write({
      actor_type: 'staff',
      actor_id: adminUser.id,
      action: 'ban_created',
      entity: 'bans',
      entity_id: ban.id,
      ip: clientIp,
      device_id: clientDeviceId || null,
      metadata: {
        type: ban.type,
        value: ban.value,
        reason: ban.reason,
        expires_at: ban.expires_at,
      },
    });

    return ban;
  }

  /**
   * Revokes an existing ban.
   */
  async revokeBan(
    banId: string,
    adminUser: UserSession,
    clientIp: string,
    clientDeviceId?: string
  ): Promise<void> {
    const ban = await this.repo.getBanById(banId);
    if (!ban) {
      throw new AppError('Ban record not found', 404, 'NOT_FOUND');
    }

    await this.repo.deleteBan(banId);

    // Remove from in-memory cache
    removeActiveBan(ban.type, ban.value);

    // Write audit log
    await audit.write({
      actor_type: 'staff',
      actor_id: adminUser.id,
      action: 'ban_revoked',
      entity: 'bans',
      entity_id: banId,
      ip: clientIp,
      device_id: clientDeviceId || null,
      metadata: {
        type: ban.type,
        value: ban.value,
      },
    });
  }

  /**
   * Lists bans with optional filtering.
   */
  async listBans(filter?: BanQueryFilter): Promise<BanRecord[]> {
    return this.repo.listBans(filter);
  }

  /**
   * Initializes / syncs in-memory ban cache from DB on startup.
   */
  async syncCacheFromDb(): Promise<void> {
    try {
      const activeBans = await this.repo.getActiveBans();
      syncActiveBans(activeBans);
    } catch {
      // Non-fatal if DB not yet reachable
    }
  }
}
