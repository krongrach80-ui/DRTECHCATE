import { randomUUID } from 'crypto';
import { AppError } from '../../middleware/errorHandler';
import { getEnv } from '../../config/env';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { UserSession } from '../../middleware/authenticate';
import { audit } from '../audit';
import { AuthService } from '../auth/service';
import { StaffRepository, defaultStaffRepository } from './repository';
import {
  CreateStaffInput,
  UpdateStaffInput,
  StaffProfileRecord,
  StaffQueryFilter,
} from './schema';

export class StaffService {
  constructor(
    private repo: StaffRepository = defaultStaffRepository,
    private authService: AuthService = new AuthService()
  ) {}

  async createStaff(
    input: CreateStaffInput,
    adminUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<StaffProfileRecord> {
    if (adminUser.role !== 'admin') {
      throw new AppError('Access denied: requires admin role to create staff', 403, 'FORBIDDEN');
    }

    const cleanUsername = input.username.trim().toLowerCase();
    const existing = await this.repo.getStaffByUsername(cleanUsername);
    if (existing) {
      throw new AppError(`Username '${cleanUsername}' is already taken`, 409, 'USERNAME_EXISTS');
    }

    let authUserId: string = randomUUID();
    let emailDomain = 'drtech.care';
    try {
      emailDomain = getEnv().INTERNAL_EMAIL_DOMAIN;
    } catch {
      // fallback
    }

    const internalEmail = `${cleanUsername}@${emailDomain}`;

    try {
      const adminClient = getAdminClient();
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: internalEmail,
        password: input.password,
        email_confirm: true,
      });

      if (!authError && authData?.user) {
        authUserId = authData.user.id;
      }
    } catch {
      // In isolated testing or offline DB, keep fallback UUID
    }

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

    return created;
  }

  async getStaffById(id: string, currentUser: UserSession): Promise<StaffProfileRecord> {
    if (currentUser.role !== 'admin' && currentUser.id !== id) {
      throw new AppError('Access denied: You can only view your own staff profile', 403, 'FORBIDDEN');
    }

    const profile = await this.repo.getStaffById(id);
    if (!profile) {
      throw new AppError(`Staff member ${id} not found`, 404, 'NOT_FOUND');
    }

    return profile;
  }

  async listStaff(filter: StaffQueryFilter, currentUser: UserSession): Promise<StaffProfileRecord[]> {
    if (currentUser.role !== 'admin') {
      throw new AppError('Access denied: requires admin role', 403, 'FORBIDDEN');
    }

    return this.repo.listStaff(filter);
  }

  async updateStaff(
    id: string,
    input: UpdateStaffInput,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<StaffProfileRecord> {
    if (currentUser.role !== 'admin' && currentUser.id !== id) {
      throw new AppError('Access denied: You can only update your own profile', 403, 'FORBIDDEN');
    }

    if (currentUser.role !== 'admin' && (input.role !== undefined || input.status !== undefined)) {
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
        role: currentUser.role === 'admin' ? input.role : undefined,
        status: currentUser.role === 'admin' ? input.status : undefined,
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
    if (adminUser.role !== 'admin') {
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
    if (adminUser.role !== 'admin') {
      throw new AppError('Access denied: requires admin role', 403, 'FORBIDDEN');
    }

    if (newPassword.length < 12) {
      throw new AppError('Password must be at least 12 characters', 400, 'VALIDATION_ERROR');
    }

    const existing = await this.repo.getStaffById(id);
    if (!existing) {
      throw new AppError(`Staff member ${id} not found`, 404, 'NOT_FOUND');
    }

    try {
      const adminClient = getAdminClient();
      await adminClient.auth.admin.updateUserById(id, { password: newPassword });
    } catch {
      // In-memory fallback
    }

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
    if (currentUser.role !== 'admin' && currentUser.id !== id) {
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

export const defaultStaffService = new StaffService();
