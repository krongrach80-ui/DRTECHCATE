import { getAdminClient } from '../../lib/supabase/adminClient';
import { StaffProfileRecord, StaffRole, StaffStatus, StaffQueryFilter } from './schema';

export class StaffRepository {
  private inMemoryStaff: Map<string, StaffProfileRecord> = new Map();

  clearInMemoryStaff(): void {
    this.inMemoryStaff.clear();
  }

  async getStaffById(id: string): Promise<StaffProfileRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data: profile, error } = await adminClient
        .from('profiles')
        .select('*, pts(*)')
        .eq('id', id)
        .maybeSingle();

      if (!error && profile) {
        return this.mapDbRecord(profile);
      }
    } catch {
      // fallback
    }

    return this.inMemoryStaff.get(id) || null;
  }

  async getStaffByUsername(username: string): Promise<StaffProfileRecord | null> {
    const cleanUsername = username.trim().toLowerCase();
    try {
      const adminClient = getAdminClient();
      const { data: profile, error } = await adminClient
        .from('profiles')
        .select('*, pts(*)')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (!error && profile) {
        return this.mapDbRecord(profile);
      }
    } catch {
      // fallback
    }

    for (const s of this.inMemoryStaff.values()) {
      if (s.username.toLowerCase() === cleanUsername) {
        return s;
      }
    }

    return null;
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

      const { data, error } = await query;
      if (!error && data) {
        return data.map((d) => this.mapDbRecord(d));
      }
    } catch {
      // fallback
    }

    let results = Array.from(this.inMemoryStaff.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (filter?.role) {
      results = results.filter((s) => s.role === filter.role);
    }
    if (filter?.status) {
      results = results.filter((s) => s.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(
        (s) => s.full_name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)
      );
    }

    return results;
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
    const record: StaffProfileRecord = {
      id: profileData.id,
      role: profileData.role,
      username: profileData.username,
      full_name: profileData.full_name,
      phone: profileData.phone || null,
      bio: profileData.bio || null,
      avatar_url: null,
      status: profileData.status || 'active',
      force_logout_at: null,
      last_login_at: null,
      created_at: nowIso,
      updated_at: nowIso,
      pt_details:
        profileData.role === 'pt' && ptData
          ? {
              license_no: ptData.license_no,
              license_expiry: ptData.license_expiry || null,
              specialty: ptData.specialty || null,
              age: ptData.age || null,
              sex: ptData.sex || null,
            }
          : null,
    };

    // Store in memory
    this.inMemoryStaff.set(record.id, record);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('profiles').insert({
        id: record.id,
        role: record.role,
        username: record.username,
        full_name: record.full_name,
        phone: record.phone,
        bio: record.bio,
        status: record.status,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });

      if (record.role === 'pt' && ptData) {
        await adminClient.from('pts').insert({
          user_id: record.id,
          license_no: ptData.license_no,
          license_expiry: ptData.license_expiry || null,
          specialty: ptData.specialty || null,
          age: ptData.age || null,
          sex: ptData.sex || null,
        });
      }
    } catch {
      // In-memory fallback
    }

    return record;
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
      throw new Error(`Staff profile ${id} not found`);
    }

    const updatedRecord: StaffProfileRecord = {
      ...existing,
      ...profileUpdates,
      updated_at: new Date().toISOString(),
      pt_details:
        existing.role === 'pt'
          ? {
              license_no: ptUpdates?.license_no ?? existing.pt_details?.license_no ?? '',
              license_expiry: ptUpdates?.license_expiry ?? existing.pt_details?.license_expiry ?? null,
              specialty: ptUpdates?.specialty ?? existing.pt_details?.specialty ?? null,
              age: ptUpdates?.age ?? existing.pt_details?.age ?? null,
              sex: ptUpdates?.sex ?? existing.pt_details?.sex ?? null,
            }
          : null,
    };

    this.inMemoryStaff.set(id, updatedRecord);

    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('profiles')
        .update({
          ...profileUpdates,
          updated_at: updatedRecord.updated_at,
        })
        .eq('id', id);

      if (existing.role === 'pt' && ptUpdates) {
        await adminClient
          .from('pts')
          .update(ptUpdates)
          .eq('user_id', id);
      }
    } catch {
      // in-memory fallback
    }

    return updatedRecord;
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

      if (!uploadError) {
        // Return signed URL or storage path
        const { data } = await adminClient.storage
          .from('avatars')
          .createSignedUrl(filePath, 3600 * 24); // 24 hours signed URL
        if (data?.signedUrl) {
          return data.signedUrl;
        }
      }
    } catch {
      // fallback
    }

    return `/storage/avatars/${filePath}`;
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

export const defaultStaffRepository = new StaffRepository();
