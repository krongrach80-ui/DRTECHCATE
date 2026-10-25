import { AppError } from '../../middleware/errorHandler';
import { UserSession } from '../../middleware/authenticate';
import { addActiveBan, removeActiveBan, syncActiveBans } from '../../middleware/banCheck';
import { audit } from '../audit';
import { logger } from '../../middleware/logger';
import { ISecurityRepository, defaultSecurityRepository } from './repository';
import { BanCreateInput, BanRecord, BanQueryFilter, AiSettings, DEFAULT_AI_SETTINGS } from './schema';
import { getEnv } from '../../config/env';

export class SecurityService {
  constructor(private repo: ISecurityRepository = defaultSecurityRepository) {}

  public setRepository(repo: ISecurityRepository): void {
    this.repo = repo;
  }

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
      const hospitalIpsSetting = getEnv().HOSPITAL_IPS;

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
   * Fail-Closed (1b.1): Must throw 503 and log error if database cannot be queried.
   */
  async syncCacheFromDb(): Promise<void> {
    try {
      const activeBans = await this.repo.getActiveBans();
      syncActiveBans(activeBans);
    } catch (err) {
      logger.error({ err }, 'Failed to synchronize active bans from database: failing closed');
      throw new AppError('Security service unavailable: failed to load active ban cache from database', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  /**
   * Retrieves current AI calibrations and thresholds.
   */
  async getAiSettings(): Promise<AiSettings> {
    return this.repo.getAiSettings();
  }

  /**
   * Updates AI thresholds and persists them with audit trail.
   */
  async updateAiSettings(
    input: Partial<AiSettings>,
    adminUser: UserSession,
    clientIp: string,
    clientDeviceId?: string
  ): Promise<AiSettings> {
    const current = await this.repo.getAiSettings();
    const updated: AiSettings = {
      ...current,
      ...input,
    };
    return this.repo.saveAiSettings(updated, {
      actor_type: adminUser.role,
      actor_id: adminUser.id,
      ip: clientIp,
      device_id: clientDeviceId || null,
      action: 'AI_SETTINGS_UPDATED',
    });
  }

  /**
   * Resets AI calibrations to standard hospital defaults.
   */
  async resetAiSettings(
    adminUser: UserSession,
    clientIp: string,
    clientDeviceId?: string
  ): Promise<AiSettings> {
    const reset = { ...DEFAULT_AI_SETTINGS };
    return this.repo.saveAiSettings(reset, {
      actor_type: adminUser.role,
      actor_id: adminUser.id,
      ip: clientIp,
      device_id: clientDeviceId || null,
      action: 'AI_SETTINGS_RESET',
    });
  }
}

export let defaultSecurityService = new SecurityService();

export function setDefaultSecurityService(service: SecurityService): void {
  defaultSecurityService = service;
}
