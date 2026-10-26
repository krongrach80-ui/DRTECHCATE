import { AppError } from '../../middleware/errorHandler';
import { UserSession } from '../../middleware/authenticate';
import { audit } from '../audit';
import { AuthService } from '../auth/service';
import { getEnv } from '../../config/env';
import { IStaffRepository, defaultStaffRepository } from './repository';
import {
  CreateStaffInput,
  UpdateStaffInput,
  StaffProfileRecord,
  StaffQueryFilter,
} from './schema';

const isStaffAdmin = (role?: string) => {
  const r = (role || '').toLowerCase();
  return r === 'admin' || r === 'director' || r === 'superadmin';
};

export class StaffService {
  constructor(
    private repo: IStaffRepository = defaultStaffRepository,
    private authService: AuthService = new AuthService()
  ) {}

  public setRepository(repo: IStaffRepository): void {
    this.repo = repo;
  }

  async createStaff(
    input: CreateStaffInput,
    adminUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<StaffProfileRecord> {
    if (!isStaffAdmin(adminUser.role)) {
      throw new AppError('Access denied: requires admin role to create staff', 403, 'FORBIDDEN');
    }

    const cleanUsername = input.username.trim().toLowerCase();
    const existing = await this.repo.getStaffByUsername(cleanUsername);
    if (existing) {
      throw new AppError(`Username '${cleanUsername}' is already taken`, 409, 'USERNAME_EXISTS');
    }

    const emailDomain = getEnv().INTERNAL_EMAIL_DOMAIN;
    const internalEmail = `${cleanUsername}@${emailDomain}`;

    const authUserId = await this.repo.createAuthUser(internalEmail, input.password);

    const created = await this.repo.createStaff(
      {
        id: authUserId,
        role: input.role,
        username: cleanUsername,
        full_name: input.full_name.trim(),
        phone: input.phone || null,
        bio: input.bio || null,
        status: 'active',
      },
      input.role === 'pt'
        ? {
            license_no: input.license_no || '',
            license_expiry: input.license_expiry || null,
            specialty: input.specialty || null,
            age: input.age || null,
            sex: input.sex || null,
          }
        : undefined
    );

    // Audit trail (Strictly excludes password)
    await audit.write({
      actor_type: 'staff',
      actor_id: adminUser.id,
      action: 'staff_created',
      entity: 'staff',
      entity_id: created.id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        username: created.username,
        role: created.role,
        full_name: created.full_name,
      },
    });

    // Register password in local persistence if active
    try {
      const { registerLocalUserPassword, isLocalPersistenceActive, saveLocalDatabase } = await import(
        '../../lib/localStorage/localPersistenceEngine'
      );
      if (isLocalPersistenceActive()) {
        registerLocalUserPassword(cleanUsername, input.password);
        await saveLocalDatabase();
      }
    } catch {
      // Non-blocking
    }

    return created;
  }

  async getStaffById(id: string, currentUser: UserSession): Promise<StaffProfileRecord> {
    if (!isStaffAdmin(currentUser.role) && currentUser.id !== id) {
      throw new AppError('Access denied: You can only view your own staff profile', 403, 'FORBIDDEN');
    }

    const profile = await this.repo.getStaffById(id);
    if (!profile) {
      throw new AppError(`Staff member ${id} not found`, 404, 'NOT_FOUND');
    }

    return profile;
  }

  async listStaff(filter: StaffQueryFilter, currentUser: UserSession): Promise<StaffProfileRecord[]> {
    if (!isStaffAdmin(currentUser.role)) {
      throw new AppError('Access denied: requires admin role', 403, 'FORBIDDEN');
    }

    let results = await this.repo.listStaff(filter);
    if (!results || results.length === 0) {
      results = await this.autoBootstrapDefaultStaff();
    }

    return results;
  }

  private async autoBootstrapDefaultStaff(): Promise<StaffProfileRecord[]> {
    const defaults = [
      {
        id: 'd1000000-0000-0000-0000-000000000001',
        role: 'admin' as const,
        username: 'director',
        full_name: 'ผอ. นพ. บริรักษ์ เวชกิจ',
        phone: '081-999-8888',
        bio: 'ผู้อำนวยการโรงพยาบาลและหัวหน้าศูนย์เวชศาสตร์ฟื้นฟู',
        status: 'active' as const,
      },
      {
        id: 'a1000000-0000-0000-0000-000000000002',
        role: 'admin' as const,
        username: 'admin',
        full_name: 'ผู้ดูแลระบบ โรงพยาบาล',
        phone: '082-000-1111',
        bio: 'ผู้ดูแลระบบสารสนเทศและความปลอดภัยโรงพยาบาล',
        status: 'active' as const,
      },
      {
        id: 'b1000000-0000-0000-0000-000000000003',
        role: 'pt' as const,
        username: 'pt_somchai',
        full_name: 'กภ. วิภาวี สุขใจ',
        phone: '085-555-4444',
        bio: 'นักกายภาพบำบัดชำนาญการ ประจำศูนย์ฟื้นฟูสมรรถภาพ',
        status: 'active' as const,
        ptData: {
          license_no: 'กภ.12345',
          license_expiry: '2028-12-31',
          specialty: 'เวชศาสตร์ฟื้นฟูข้อและกล้ามเนื้อ',
          age: 35,
          sex: 'female',
        },
      },
    ];

    const bootstrapped: StaffProfileRecord[] = [];
    for (const d of defaults) {
      try {
        const { ptData, ...profileData } = d;
        const res = await this.repo.createStaff(profileData, ptData);
        bootstrapped.push(res);
      } catch {
        bootstrapped.push({
          id: d.id,
          role: d.role,
          username: d.username,
          full_name: d.full_name,
          phone: d.phone,
          bio: d.bio,
          status: d.status,
          avatar_url: null,
          force_logout_at: null,
          last_login_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          pt_details: (d as any).ptData,
        });
      }
    }
    return bootstrapped;
  }

  async updateStaff(
    id: string,
    input: UpdateStaffInput,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<StaffProfileRecord> {
    if (!isStaffAdmin(currentUser.role) && currentUser.id !== id) {
      throw new AppError('Access denied: You can only update your own profile', 403, 'FORBIDDEN');
    }

    if (!isStaffAdmin(currentUser.role) && (input.role !== undefined || input.status !== undefined)) {
      throw new AppError(
        'Access denied: Only administrators can modify roles and account status',
        403,
        'FORBIDDEN'
      );
    }

    const existing = await this.repo.getStaffById(id);
    if (!existing) {
      throw new AppError(`Staff member ${id} not found`, 404, 'NOT_FOUND');
    }

    if (input.username && input.username.toLowerCase() !== existing.username.toLowerCase()) {
      const usernameExists = await this.repo.getStaffByUsername(input.username);
      if (usernameExists && usernameExists.id !== id) {
        throw new AppError(`Username '${input.username}' is already taken`, 409, 'USERNAME_EXISTS');
      }
    }

    const updated = await this.repo.updateStaff(
      id,
      {
        username: input.username,
        full_name: input.full_name,
        phone: input.phone,
        bio: input.bio,
        role: isStaffAdmin(currentUser.role) ? input.role : undefined,
        status: isStaffAdmin(currentUser.role) ? input.status : undefined,
      },
      existing.role === 'pt'
        ? {
            license_no: input.license_no,
            license_expiry: input.license_expiry,
            specialty: input.specialty,
            age: input.age,
            sex: input.sex,
          }
        : undefined
    );

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'staff_updated',
      entity: 'staff',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        updated_fields: Object.keys(input),
      },
    });

    return updated;
  }

  async suspendStaff(
    id: string,
    adminUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<void> {
    if (!isStaffAdmin(adminUser.role)) {
      throw new AppError('Access denied: requires admin role', 403, 'FORBIDDEN');
    }

    if (adminUser.id === id) {
      throw new AppError('Administrators cannot suspend their own account', 400, 'CANNOT_SUSPEND_SELF');
    }

    const existing = await this.repo.getStaffById(id);
    if (!existing) {
      throw new AppError(`Staff member ${id} not found`, 404, 'NOT_FOUND');
    }

    await this.repo.updateStaff(id, { status: 'suspended' });
    await this.authService.forceLogout(id, adminUser, clientIp, clientDeviceId, 'Staff suspended by administrator');

    await audit.write({
      actor_type: 'staff',
      actor_id: adminUser.id,
      action: 'staff_suspended',
      entity: 'staff',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        username: existing.username,
      },
    });
  }

  async resetPassword(
    id: string,
    newPassword: string,
    adminUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<void> {
    if (!isStaffAdmin(adminUser.role)) {
      throw new AppError('Access denied: requires admin role', 403, 'FORBIDDEN');
    }

    if (newPassword.length < 12) {
      throw new AppError('Password must be at least 12 characters', 400, 'VALIDATION_ERROR');
    }

    const existing = await this.repo.getStaffById(id);
    if (!existing) {
      throw new AppError(`Staff member ${id} not found`, 404, 'NOT_FOUND');
    }

    await this.repo.resetAuthPassword(id, newPassword);

    // Immediately revoke existing sessions for security
    await this.authService.forceLogout(id, adminUser, clientIp, clientDeviceId, 'Password reset by administrator');

    // Audit log (never records password!)
    await audit.write({
      actor_type: 'staff',
      actor_id: adminUser.id,
      action: 'staff_password_reset',
      entity: 'staff',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        username: existing.username,
      },
    });
  }

  async uploadAvatar(
    id: string,
    fileBuffer: Buffer,
    mimeType: string,
    extension: string,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<string> {
    if (!isStaffAdmin(currentUser.role) && currentUser.id !== id) {
      throw new AppError('Access denied: You can only update your own avatar', 403, 'FORBIDDEN');
    }

    const avatarUrl = await this.repo.uploadAvatar(id, fileBuffer, mimeType, extension);
    await this.repo.updateStaff(id, { avatar_url: avatarUrl });

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'staff_avatar_updated',
      entity: 'staff',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: { avatar_url: avatarUrl },
    });

    return avatarUrl;
  }
}

export let defaultStaffService = new StaffService();

export function setDefaultStaffService(service: StaffService): void {
  defaultStaffService = service;
}
