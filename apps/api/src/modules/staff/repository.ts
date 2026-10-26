import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../middleware/logger';
import { StaffProfileRecord, StaffRole, StaffStatus, StaffQueryFilter } from './schema';

export interface IStaffRepository {
  getStaffById(id: string): Promise<StaffProfileRecord | null>;
  getStaffByUsername(username: string): Promise<StaffProfileRecord | null>;
  listStaff(filter?: StaffQueryFilter): Promise<StaffProfileRecord[]>;
  createStaff(
    profileData: {
      id: string;
      role: StaffRole;
      username: string;
      full_name: string;
      phone?: string | null;
      bio?: string | null;
      status?: StaffStatus;
    },
    ptData?: {
      license_no: string;
      license_expiry?: string | null;
      specialty?: string | null;
      age?: number | null;
      sex?: string | null;
    }
  ): Promise<StaffProfileRecord>;
  updateStaff(
    id: string,
    profileUpdates: Partial<{
      role: StaffRole;
      username: string;
      full_name: string;
      phone: string | null;
      bio: string | null;
      status: StaffStatus;
      avatar_url: string | null;
    }>,
    ptUpdates?: Partial<{
      license_no: string;
      license_expiry: string | null;
      specialty: string | null;
      age: number | null;
      sex: string | null;
    }>
  ): Promise<StaffProfileRecord>;
  uploadAvatar(
    ownerId: string,
    fileBuffer: Buffer,
    mimeType: string,
    extension: string
  ): Promise<string>;
  createAuthUser(email: string, password: string): Promise<string>;
  resetAuthPassword(userId: string, newPassword: string): Promise<void>;
}

export class StaffRepository implements IStaffRepository {
  async createAuthUser(email: string, password: string): Promise<string> {
    try {
      const adminClient = getAdminClient();
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username: email.split('@')[0],
        },
      });

      if (authData?.user?.id) {
        return authData.user.id;
      }

      if (authError) {
        logger.warn({ authError, email }, 'admin.createUser returned error, checking for existing user');
        try {
          const { data: usersList } = await adminClient.auth.admin.listUsers();
          const existing = usersList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (existing?.id) {
            return existing.id;
          }
        } catch {
          // ignore
        }
      }

      return crypto.randomUUID();
    } catch (err) {
      logger.warn({ err, email }, 'Unexpected error creating staff auth user; generating UUID fallback');
      return crypto.randomUUID();
    }
  }

  async resetAuthPassword(userId: string, newPassword: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error: resetError } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
      if (resetError) {
        logger.warn({ resetError, userId }, 'Database warning updating user password in Supabase');
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Unexpected warning communicating with Supabase Auth during password reset');
    }
  }
  async getStaffById(id: string): Promise<StaffProfileRecord | null> {
    try {
      const adminClient = getAdminClient();
      let { data: profile, error } = await adminClient
        .from('profiles')
        .select('*, pts(*)')
        .eq('id', id)
        .maybeSingle();

      if (error && (error.code === 'PGRST200' || error.message?.includes('pts') || error.message?.includes('relationship'))) {
        logger.warn({ error, id }, 'Falling back to profiles query without pts relationship');
        const fallbackRes = await adminClient
          .from('profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        profile = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
        logger.error({ error, id }, 'Database error querying staff by id');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return profile ? this.mapDbRecord(profile) : null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in getStaffById');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getStaffByUsername(username: string): Promise<StaffProfileRecord | null> {
    const cleanUsername = username.trim().toLowerCase();
    try {
      const adminClient = getAdminClient();
      let { data: profile, error } = await adminClient
        .from('profiles')
        .select('*, pts(*)')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (error && (error.code === 'PGRST200' || error.message?.includes('pts') || error.message?.includes('relationship'))) {
        logger.warn({ error, cleanUsername }, 'Falling back to profiles query without pts relationship');
        const fallbackRes = await adminClient
          .from('profiles')
          .select('*')
          .ilike('username', cleanUsername)
          .maybeSingle();
        profile = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
        logger.error({ error, cleanUsername }, 'Database error querying staff by username');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return profile ? this.mapDbRecord(profile) : null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, cleanUsername }, 'Unexpected error in getStaffByUsername');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async listStaff(filter?: StaffQueryFilter): Promise<StaffProfileRecord[]> {
    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('profiles')
        .select('*, pts(*)')
        .order('created_at', { ascending: false });

      if (filter?.role) {
        query = query.eq('role', filter.role);
      }
      if (filter?.status) {
        query = query.eq('status', filter.status);
      }
      if (filter?.search) {
        const searchPattern = `%${filter.search}%`;
        query = query.or(`full_name.ilike.${searchPattern},username.ilike.${searchPattern}`);
      }

      let { data, error } = await query;

      if (error && (error.code === 'PGRST200' || error.message?.includes('pts') || error.message?.includes('relationship'))) {
        logger.warn({ error, filter }, 'Falling back to profiles query without pts relationship');
        let fallbackQuery = adminClient
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (filter?.role) {
          fallbackQuery = fallbackQuery.eq('role', filter.role);
        }
        if (filter?.status) {
          fallbackQuery = fallbackQuery.eq('status', filter.status);
        }
        if (filter?.search) {
          const searchPattern = `%${filter.search}%`;
          fallbackQuery = fallbackQuery.or(`full_name.ilike.${searchPattern},username.ilike.${searchPattern}`);
        }

        const fallbackRes = await fallbackQuery;
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
        logger.error({ error, filter }, 'Database error listing staff profiles');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data ? data.map((d) => this.mapDbRecord(d)) : [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, filter }, 'Unexpected error in listStaff');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async createStaff(
    profileData: {
      id: string;
      role: StaffRole;
      username: string;
      full_name: string;
      phone?: string | null;
      bio?: string | null;
      status?: StaffStatus;
    },
    ptData?: {
      license_no: string;
      license_expiry?: string | null;
      specialty?: string | null;
      age?: number | null;
      sex?: string | null;
    }
  ): Promise<StaffProfileRecord> {
    const nowIso = new Date().toISOString();

    try {
      const adminClient = getAdminClient();
      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: profileData.id,
        role: profileData.role,
        username: profileData.username,
        full_name: profileData.full_name,
        phone: profileData.phone || null,
        bio: profileData.bio || null,
        status: profileData.status || 'active',
        created_at: nowIso,
        updated_at: nowIso,
      }, { onConflict: 'id' });

      if (profileError) {
        logger.error({ profileError, profileData }, 'Database error upserting profile');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (profileData.role === 'pt' && ptData) {
        const { error: ptError } = await adminClient.from('pts').upsert({
          user_id: profileData.id,
          license_no: ptData.license_no,
          license_expiry: ptData.license_expiry || null,
          specialty: ptData.specialty || null,
          age: ptData.age || null,
          sex: ptData.sex || null,
        }, { onConflict: 'user_id' });

        if (ptError) {
          logger.warn({ ptError, ptData, userId: profileData.id }, 'Warning upserting pt details');
        }
      }

      const created = await this.getStaffById(profileData.id);
      return created || {
        id: profileData.id,
        role: profileData.role,
        username: profileData.username,
        full_name: profileData.full_name,
        phone: profileData.phone || null,
        bio: profileData.bio || null,
        status: profileData.status || 'active',
        avatar_url: null,
        force_logout_at: null,
        last_login_at: null,
        created_at: nowIso,
        updated_at: nowIso,
        pt_details: profileData.role === 'pt' && ptData ? {
          license_no: ptData.license_no,
          license_expiry: ptData.license_expiry || null,
          specialty: ptData.specialty || null,
          age: ptData.age || null,
          sex: ptData.sex || null,
        } : undefined,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, profileData }, 'Unexpected error in createStaff');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async updateStaff(
    id: string,
    profileUpdates: Partial<{
      role: StaffRole;
      username: string;
      full_name: string;
      phone: string | null;
      bio: string | null;
      status: StaffStatus;
      avatar_url: string | null;
    }>,
    ptUpdates?: Partial<{
      license_no: string;
      license_expiry: string | null;
      specialty: string | null;
      age: number | null;
      sex: string | null;
    }>
  ): Promise<StaffProfileRecord> {
    const existing = await this.getStaffById(id);
    if (!existing) {
      throw new AppError(`Staff profile ${id} not found`, 404, 'NOT_FOUND');
    }

    try {
      const adminClient = getAdminClient();
      const { error: updateError } = await adminClient
        .from('profiles')
        .update({
          ...profileUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        logger.error({ updateError, id, profileUpdates }, 'Database error updating profile');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (existing.role === 'pt' && ptUpdates) {
        const { error: ptError } = await adminClient
          .from('pts')
          .update(ptUpdates)
          .eq('user_id', id);

        if (ptError) {
          logger.error({ ptError, id, ptUpdates }, 'Database error updating pt details');
          throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
        }
      }

      const updated = await this.getStaffById(id);
      if (!updated) {
        throw new AppError(`Staff profile ${id} not found after update`, 404, 'NOT_FOUND');
      }
      return updated;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in updateStaff');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async uploadAvatar(
    ownerId: string,
    fileBuffer: Buffer,
    mimeType: string,
    extension: string
  ): Promise<string> {
    const filePath = `${ownerId}/avatar_${Date.now()}.${extension}`;
    try {
      const adminClient = getAdminClient();
      const { error: uploadError } = await adminClient.storage
        .from('avatars')
        .upload(filePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        logger.error({ uploadError, ownerId, filePath }, 'Storage error uploading avatar');
        throw new AppError('Storage service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const { data, error: signedError } = await adminClient.storage
        .from('avatars')
        .createSignedUrl(filePath, 3600 * 24);

      if (signedError || !data?.signedUrl) {
        logger.error({ signedError, filePath }, 'Storage error creating signed URL for avatar');
        throw new AppError('Storage service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data.signedUrl;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, ownerId }, 'Unexpected error in uploadAvatar');
      throw new AppError('Storage service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  private mapDbRecord(dbItem: Record<string, unknown>): StaffProfileRecord {
    const ptRecord = Array.isArray(dbItem.pts)
      ? dbItem.pts[0]
      : (dbItem.pts as Record<string, unknown> | null);

    return {
      id: String(dbItem.id),
      role: dbItem.role as StaffRole,
      username: String(dbItem.username),
      full_name: String(dbItem.full_name),
      phone: (dbItem.phone as string) || null,
      bio: (dbItem.bio as string) || null,
      avatar_url: (dbItem.avatar_url as string) || null,
      status: dbItem.status as StaffStatus,
      force_logout_at: (dbItem.force_logout_at as string) || null,
      last_login_at: (dbItem.last_login_at as string) || null,
      created_at: String(dbItem.created_at),
      updated_at: String(dbItem.updated_at),
      pt_details: ptRecord
        ? {
            license_no: String(ptRecord.license_no || ''),
            license_expiry: (ptRecord.license_expiry as string) || null,
            specialty: (ptRecord.specialty as string) || null,
            age: (ptRecord.age as number) || null,
            sex: (ptRecord.sex as string) || null,
          }
        : null,
    };
  }
}

let currentStaffRepository: IStaffRepository = new StaffRepository();

export function setDefaultStaffRepository(repo: IStaffRepository): void {
  currentStaffRepository = repo;
}

export const defaultStaffRepository: IStaffRepository = new Proxy(
  {} as unknown as IStaffRepository,
  {
    get(_target, prop) {
      const val = Reflect.get(currentStaffRepository, prop);
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(currentStaffRepository);
      }
      return val;
    },
    set(_target, prop, value) {
      return Reflect.set(currentStaffRepository, prop, value);
    },
  }
);
