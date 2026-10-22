import crypto from 'crypto';
import { AppError } from '../../middleware/errorHandler';
import { KioskRepository, PairingRecord } from './repository';
import { getEnv } from '../../config/env';

export class KioskService {
  private readonly IP_MAX_ATTEMPTS = 5;
  private readonly IP_LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  private readonly CODE_MAX_ATTEMPTS = 3;
  private readonly GLOBAL_MAX_ATTEMPTS = 50; // Max 50 failed attempts globally in 15 min

  constructor(
    private repo = new KioskRepository(),
    private secretOverride?: string
  ) {}

  private getHmacSecret(): string {
    if (this.secretOverride) return this.secretOverride;
    try {
      return getEnv().KIOSK_PAIRING_SECRET;
    } catch {
      return 'kiosk-pairing-hmac-secret-min-16-chars-for-dev';
    }
  }

  /**
   * Generates a 6-character pairing code using crypto.randomInt (Requirement 2)
   */
  public generateCodeRandomInt(): string {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[crypto.randomInt(0, chars.length)];
    }
    return code;
  }

  /**
   * Computes HMAC-SHA256 of the pairing code using the env secret (Requirement 2)
   */
  public computeHmacSha256(code: string): string {
    const secret = this.getHmacSecret();
    return crypto
      .createHmac('sha256', secret)
      .update(code.trim().toUpperCase())
      .digest('hex');
  }

  /**
   * Constant-time comparison between submitted code and stored HMAC-SHA256 digest
   */
  public verifyCodeConstantTime(inputCode: string, storedHmacHex: string): boolean {
    const secret = this.getHmacSecret();
    const inputHmacBuffer = crypto
      .createHmac('sha256', secret)
      .update(inputCode.trim().toUpperCase())
      .digest();

    let storedHmacBuffer: Buffer;
    try {
      storedHmacBuffer = Buffer.from(storedHmacHex, 'hex');
    } catch {
      return false;
    }

    if (inputHmacBuffer.length !== storedHmacBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(inputHmacBuffer, storedHmacBuffer);
  }

  /**
   * Admin-only: Generate a single-use pairing code valid for exactly 10 minutes.
   * 1. Uses crypto.randomInt to generate random code
   * 2. Stores ONLY the HMAC-SHA256 in DB, never plain text
   * 3. Resets failure count and unlocks code in DB if generating new code for kiosk
   */
  async generatePairingCode(kioskId: string): Promise<{ code: string; expiresInSeconds: number }> {
    // 1. Generate code using crypto.randomInt
    const plainCode = this.generateCodeRandomInt();

    // 2. Compute HMAC-SHA256 with env secret
    const codeHmac = this.computeHmacSha256(plainCode);

    const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MS);

    const record: PairingRecord = {
      kioskId,
      codeHash: codeHmac,
      expiresAt,
      failedAttempts: 0,
      isUsed: false,
      isLocked: false,
      createdAt: new Date(),
    };

    // Stored in database
    await this.repo.savePairingRecord(record);

    return {
      code: plainCode,
      expiresInSeconds: 600, // 10 minutes
    };
  }

  /**
   * Kiosk device pairing redemption:
   * Enforces DB-backed limits:
   * 1. Global /api/kiosk/pair rate limit (DB-persisted)
   * 2. Per-IP brute-force limit (DB-persisted, max 5 fails / 15 min -> 429)
   * 3. Per-code/kiosk brute-force limit (DB-persisted, max 3 fails -> 403 lock)
   * 4. 10-minute expiry
   * 5. Single-use enforcement
   * 6. Constant-time HMAC-SHA256 verification
   */
  async pairDevice(
    kioskId: string,
    inputCode: string,
    clientIp: string
  ): Promise<{ deviceToken: string; kiosk: { id: string; name: string; location?: string | null } }> {
    // 1. Check Global rate limit from DB
    const globalFailures = await this.repo.getGlobalFailureCount(this.IP_LOCK_WINDOW_MS);
    if (globalFailures >= this.GLOBAL_MAX_ATTEMPTS) {
      throw new AppError(
        'Global pairing endpoint is temporarily throttled due to excessive failed attempts. Please try again later.',
        429,
        'GLOBAL_PAIRING_RATE_LIMIT'
      );
    }

    // 2. Check IP rate limit from DB
    const ipFailures = await this.repo.getIpFailureCount(clientIp, this.IP_LOCK_WINDOW_MS);
    if (ipFailures >= this.IP_MAX_ATTEMPTS) {
      throw new AppError(
        'Too many failed pairing attempts from this IP. Please try again in 15 minutes.',
        429,
        'TOO_MANY_FAILED_ATTEMPTS'
      );
    }

    // 3. Lookup pairing record from DB
    const record = await this.repo.getPairingRecord(kioskId);
    if (!record) {
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();
      throw new AppError('Invalid or nonexistent pairing target', 400, 'INVALID_PAIRING_CODE');
    }

    // 4. Check if locked due to per-code brute force (> 3 attempts) in DB
    if (record.isLocked || record.failedAttempts >= this.CODE_MAX_ATTEMPTS) {
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();
      throw new AppError(
        'Pairing code has been locked due to excessive failed attempts',
        403,
        'PAIRING_CODE_LOCKED'
      );
    }

    // 5. Check if already used (Single-use invariant)
    if (record.isUsed) {
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();
      throw new AppError('Pairing code has already been used', 400, 'PAIRING_CODE_ALREADY_USED');
    }

    // 6. Check if expired (10-minute expiry)
    if (Date.now() > record.expiresAt.getTime()) {
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();
      throw new AppError('Pairing code has expired (10-minute limit exceeded)', 400, 'PAIRING_CODE_EXPIRED');
    }

    // 7. Verify submitted code using CONSTANT-TIME HMAC-SHA256 comparison
    const isMatch = this.verifyCodeConstantTime(inputCode, record.codeHash);

    if (!isMatch) {
      const attempts = await this.repo.recordKioskCodeFailure(kioskId);
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();

      if (attempts >= this.CODE_MAX_ATTEMPTS) {
        throw new AppError(
          'Pairing code has been locked due to excessive failed attempts',
          403,
          'PAIRING_CODE_LOCKED'
        );
      }

      throw new AppError('Invalid pairing code', 400, 'INVALID_PAIRING_CODE');
    }

    // 8. Successful match: generate high-entropy device token (32 bytes)
    const deviceToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');

    // Mark as used in database
    await this.repo.markPairingUsed(kioskId, tokenHash);

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
}
