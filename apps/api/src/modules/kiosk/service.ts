import crypto from 'crypto';
import { AppError } from '../../middleware/errorHandler';
import { KioskRepository, PairingRecord } from './repository';

interface IpAttemptRecord {
  count: number;
  resetAt: number;
}

export class KioskService {
  // IP-level failed attempts tracker (Max 5 failed attempts in 15 minutes)
  private ipFailedAttempts = new Map<string, IpAttemptRecord>();
  private readonly IP_MAX_ATTEMPTS = 5;
  private readonly IP_LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  private readonly CODE_MAX_ATTEMPTS = 3;

  constructor(private repo = new KioskRepository()) {}

  /**
   * Helper: Record failed attempt for IP and enforce rate limit
   */
  private checkAndRecordIpFailure(clientIp: string): void {
    const now = Date.now();
    let record = this.ipFailedAttempts.get(clientIp);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + this.IP_LOCK_WINDOW_MS };
    } else {
      record.count += 1;
    }

    this.ipFailedAttempts.set(clientIp, record);
  }

  private verifyIpQuota(clientIp: string): void {
    const now = Date.now();
    const record = this.ipFailedAttempts.get(clientIp);

    if (record && now <= record.resetAt && record.count >= this.IP_MAX_ATTEMPTS) {
      throw new AppError(
        'Too many failed pairing attempts from this IP. Please try again in 15 minutes.',
        429,
        'TOO_MANY_FAILED_ATTEMPTS'
      );
    }
  }

  /**
   * Constant-time comparison between submitted code and stored SHA-256 hash digest
   */
  public verifyCodeConstantTime(inputCode: string, storedHashHex: string): boolean {
    const inputHashBuffer = crypto
      .createHash('sha256')
      .update(inputCode.trim().toUpperCase())
      .digest();

    let storedHashBuffer: Buffer;
    try {
      storedHashBuffer = Buffer.from(storedHashHex, 'hex');
    } catch {
      return false;
    }

    if (inputHashBuffer.length !== storedHashBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(inputHashBuffer, storedHashBuffer);
  }

  /**
   * Admin-only: Generate a single-use pairing code valid for exactly 10 minutes.
   * Stores ONLY the SHA-256 hash in repository/DB, never plain text.
   */
  async generatePairingCode(kioskId: string): Promise<{ code: string; expiresInSeconds: number }> {
    // Generate secure 6-character uppercase alphanumeric code
    const plainCode = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();

    // Store ONLY the SHA-256 hash (Rule: Never store plain text in DB)
    const codeHash = crypto
      .createHash('sha256')
      .update(plainCode)
      .digest('hex');

    const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MS);

    const record: PairingRecord = {
      kioskId,
      codeHash,
      expiresAt,
      failedAttempts: 0,
      isUsed: false,
      isLocked: false,
      createdAt: new Date(),
    };

    await this.repo.savePairingRecord(record);

    return {
      code: plainCode,
      expiresInSeconds: 600, // 10 minutes
    };
  }

  /**
   * Kiosk device pairing redemption:
   * Enforces:
   * 1. IP brute-force throttling (max 5 fails / 15 min)
   * 2. Per-code brute-force throttling (max 3 fails -> lock)
   * 3. 10-minute expiry
   * 4. Single-use enforcement
   * 5. Constant-time hash verification
   */
  async pairDevice(
    kioskId: string,
    inputCode: string,
    clientIp: string
  ): Promise<{ deviceToken: string; kiosk: { id: string; name: string; location?: string | null } }> {
    // 1. Check IP brute-force quota
    this.verifyIpQuota(clientIp);

    // 2. Lookup pairing record
    const record = await this.repo.getPairingRecord(kioskId);
    if (!record) {
      this.checkAndRecordIpFailure(clientIp);
      throw new AppError('Invalid or nonexistent pairing target', 400, 'INVALID_PAIRING_CODE');
    }

    // 3. Check if locked due to per-code brute force (> 3 attempts)
    if (record.isLocked || record.failedAttempts >= this.CODE_MAX_ATTEMPTS) {
      this.checkAndRecordIpFailure(clientIp);
      throw new AppError(
        'Pairing code has been locked due to excessive failed attempts',
        403,
        'PAIRING_CODE_LOCKED'
      );
    }

    // 4. Check if already used (Single-use invariant)
    if (record.isUsed) {
      this.checkAndRecordIpFailure(clientIp);
      throw new AppError('Pairing code has already been used', 400, 'PAIRING_CODE_ALREADY_USED');
    }

    // 5. Check if expired (10-minute expiry)
    if (Date.now() > record.expiresAt.getTime()) {
      this.checkAndRecordIpFailure(clientIp);
      throw new AppError('Pairing code has expired (10-minute limit exceeded)', 400, 'PAIRING_CODE_EXPIRED');
    }

    // 6. Verify submitted code using CONSTANT-TIME comparison
    const isMatch = this.verifyCodeConstantTime(inputCode, record.codeHash);

    if (!isMatch) {
      const attempts = await this.repo.incrementFailedAttempts(kioskId);
      this.checkAndRecordIpFailure(clientIp);

      if (attempts >= this.CODE_MAX_ATTEMPTS) {
        throw new AppError(
          'Pairing code has been locked due to excessive failed attempts',
          403,
          'PAIRING_CODE_LOCKED'
        );
      }

      throw new AppError('Invalid pairing code', 400, 'INVALID_PAIRING_CODE');
    }

    // 7. Successful match: generate high-entropy device token (32 bytes)
    const deviceToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');

    // Mark as used in repository & database
    await this.repo.markPairingUsed(kioskId, tokenHash);

    // Reset IP failed attempts counter on success
    this.ipFailedAttempts.delete(clientIp);

    // Fetch kiosk info for response
    const kiosk = await this.repo.getKioskById(kioskId);

    return {
      deviceToken,
      kiosk: {
        id: kioskId,
        name: kiosk?.name || 'Kiosk Device',
        location: kiosk?.location,
      },
    };
  }

  // Testing helper to reset IP limits
  resetIpLimits(): void {
    this.ipFailedAttempts.clear();
  }
}
