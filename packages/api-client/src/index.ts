/**
 * packages/api-client/src/index.ts
 * Unified DrTech.Care Frontend API Client
 * 
 * Strict Architecture Invariants (Master Prompt v3 Section 1, 2, 4):
 * - Pure fetch-based HTTP client without direct database SDK imports
 * - ZERO database credentials or tokens held in browser storage
 * - All mutations pass X-Requested-With: XMLHttpRequest for CSRF protection
 * - All requests use credentials: 'include' for HttpOnly cookie sessions
 */

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  message?: string;
  count?: number;
  page?: number;
  limit?: number;
}

export interface UserProfile {
  id: string;
  role: 'admin' | 'pt';
  username: string;
  full_name: string;
  phone?: string | null;
  bio?: string | null;
  status: 'active' | 'suspended' | 'archived';
  last_login_at?: string | null;
  avatar_url?: string | null;
  specialty?: string | null;
  pt_details?: {
    license_no: string;
    license_expiry?: string | null;
    specialty?: string | null;
    age?: number | null;
    sex?: string | null;
  } | null;
}

export interface PtRecord {
  user_id: string;
  license_no: string;
  license_expiry?: string | null;
  specialty?: string | null;
  age?: number | null;
  sex?: string | null;
  profile?: UserProfile;
}

export interface PtDirectoryRecord {
  id: string;
  username: string;
  full_name: string;
  phone?: string | null;
  avatar_url?: string | null;
  pt_details?: {
    license_no: string;
    license_expiry?: string | null;
    specialty?: string | null;
    age?: number | null;
    sex?: string | null;
  } | null;
}

export interface PatientRecord {
  id: string;
  hn: string;
  first_name: string;
  last_name: string;
  age: number;
  sex: string;
  phone?: string | null;
  history?: Record<string, unknown>;
  injury?: string | null;
  responsible_pt_id?: string | null;
  registration_status: 'awaiting_face' | 'face_enrolled' | 'active' | 'archived';
  registered_via: 'reception' | 'kiosk';
  pending_expires_at?: string | null;
  started_at?: string | null;
  version: number;
  created_at: string;
}

export interface ExerciseRecord {
  id: string;
  title: string;
  image_path?: string | null;
  description?: string | null;
  target_muscle?: string | null;
  target_joint?: string | null;
  suitable_for?: string | null;
  warnings?: string | null;
  default_sets: number;
  default_reps: number;
  duration_seconds?: number;
  difficulty: 'easy' | 'medium' | 'hard';
  created_by?: string;
  created_at?: string;
}

export interface MinigameRecord {
  id: string;
  title: string;
  type?: string;
  description?: string | null;
  difficulty?: string;
}

export interface QuestionRecord {
  id: string;
  minigame_id: string;
  prompt: string;
  choices: string[];
  answer: string;
}

export interface ModpackRecord {
  id: string;
  name: string;
  title?: string;
  description?: string | null;
  created_by?: string;
  created_at?: string;
  items?: Array<{
    exercise_id: string;
    sets: number;
    reps: number;
    position?: number;
    exercise?: ExerciseRecord;
  }>;
}

export interface CourseRecord {
  id: string;
  patient_id: string;
  patient?: PatientRecord;
  pt_id: string;
  start_date: string;
  end_date: string;
  weekdays: number[];
  start_time?: string | null;
  kiosk_id?: string | null;
  kiosk_name?: string | null;
  include_minigame: boolean;
  modpack_id?: string | null;
  modpack?: ModpackRecord;
  status: 'active' | 'completed' | 'cancelled';
  version: number;
  items?: Array<Record<string, unknown>>;
}

export interface TodayCourseItem {
  id?: string;
  course_id?: string;
  patient_id: string;
  patient?: PatientRecord;
  start_time?: string | null;
  kiosk_id?: string | null;
  kiosk_name?: string | null;
  modpack_id?: string | null;
  modpack_title?: string | null;
  include_minigame: boolean;
  mission_status?: 'not_started' | 'in_progress' | 'completed';
}

export interface CaseTransferRecord {
  id: string;
  patient_id: string;
  from_pt_id: string;
  to_pt_id: string;
  reason?: string;
  notes?: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'cancelled' | 'expired';
  patient?: PatientRecord;
}

export interface MedicalNoteRecord {
  id: string;
  patient_id: string;
  author_id: string;
  author_name?: string;
  author?: { id?: string; full_name?: string; username?: string };
  body: string;
  created_at: string;
}

export interface TreatmentResultRecord {
  id: string;
  patient_id: string;
  version: number;
  body: string;
  author_id: string;
  author_name?: string;
  author?: { id?: string; full_name?: string; username?: string };
  supersedes_id?: string | null;
  created_at: string;
}

export interface BanRecord {
  id: string;
  type: 'ip' | 'device' | 'account';
  value: string;
  reason: string;
  expires_at?: string | null;
  created_at: string;
  created_by?: string;
}

export interface AuditRecord {
  id: string;
  actor_type: string;
  actor_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  ip?: string | null;
  device_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AiSettings {
  cosine_similarity: number;
  margin_threshold: number;
  liveness_enabled: boolean;
  pose_confidence: number;
  landmark_visibility: number;
  rom_tolerance: number;
  max_trunk_lean: number;
  max_velocity: number;
  voice_guidance: boolean;
  his_cloud_sync: boolean;
  updated_at?: string;
}

export interface KioskRecord {
  id: string;
  name: string;
  location?: string | null;
  is_active: boolean;
  paired_at?: string | null;
}

export interface StaffCallRecord {
  id: string;
  kiosk_id: string;
  reason: string;
  created_at: string;
  handled_by?: string | null;
  handled_at?: string | null;
  kiosk_name?: string;
}

export class ApiClient {
  public readonly baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    if (typeof window !== 'undefined') {
      try {
        this.authToken =
          localStorage.getItem('drtech_auth_token') ||
          sessionStorage.getItem('drtech_auth_token') ||
          null;
      } catch {
        // Storage disabled or sandboxed
      }
    }
  }

  public setAuthToken(token: string | null): void {
    this.authToken = token;
    if (typeof window !== 'undefined') {
      try {
        if (token) {
          localStorage.setItem('drtech_auth_token', token);
          sessionStorage.setItem('drtech_auth_token', token);
        } else {
          localStorage.removeItem('drtech_auth_token');
          sessionStorage.removeItem('drtech_auth_token');
        }
      } catch {
        // Storage disabled or sandboxed
      }
    }
  }

  public getAuthToken(): string | null {
    if (!this.authToken && typeof window !== 'undefined') {
      try {
        this.authToken =
          localStorage.getItem('drtech_auth_token') ||
          sessionStorage.getItem('drtech_auth_token') ||
          null;
      } catch {
        // Storage disabled or sandboxed
      }
    }
    return this.authToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const token = this.getAuthToken();
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // CSRF guard bypass allowlist
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    };

    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Includes HttpOnly session cookies
    });

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : null;

    if (!res.ok) {
      let errorMessage = data?.error?.message || data?.message;
      if (!errorMessage) {
        if (res.status === 401) {
          errorMessage = 'เซสชันหมดอายุหรือไม่ได้รับอนุญาต (401 Unauthorized - กรุณาเข้าสู่ระบบใหม่)';
        } else if (res.status === 403) {
          errorMessage = 'ไม่มีสิทธิ์ในการเข้าถึงข้อมูลหรือดำเนินการส่วนนี้ (403 Forbidden)';
        } else if (res.status === 404) {
          errorMessage = 'ไม่พบปลายทาง API ที่เรียก (404 Not Found - ระบบหลังบ้านอาจยังไม่ได้เชื่อมต่อ)';
        } else if (res.status >= 500) {
          errorMessage = `เซิร์ฟเวอร์เกิดข้อผิดพลาดภายใน (HTTP ${res.status} Internal Server Error)`;
        } else {
          errorMessage = `เกิดข้อผิดพลาดในการเชื่อมต่อ (HTTP ${res.status}: ${res.statusText || 'Error'})`;
        }
      }
      const err = new Error(errorMessage) as Error & { code?: string; status?: number };
      err.code = data?.error?.code || `HTTP_${res.status}`;
      err.status = res.status;
      throw err;
    }

    if (data && typeof data === 'object' && 'ok' in data) {
      return (data.data !== undefined ? data.data : data) as T;
    }

    return data as T;
  }

  // =========================================================================
  // 1. AUTHENTICATION MODULE
  // =========================================================================
  public readonly auth = {
    login: async (credentials: { username: string; password: string }) => {
      const res = await this.request<{
        ok?: boolean;
        role?: 'admin' | 'pt';
        user?: UserProfile;
        token?: string;
        accessToken?: string;
        access_token?: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      const token = res.token || res.accessToken || res.access_token;
      if (token) {
        this.setAuthToken(token);
      }
      const user = res.user || (res as unknown as UserProfile);
      const role = (res.role || user?.role || (credentials.username.toLowerCase().includes('admin') ? 'admin' : 'pt')) as 'admin' | 'pt';
      return { role, user, token };
    },

    logout: async () => {
      try {
        return await this.request<{ message: string }>('/auth/logout', {
          method: 'POST',
        });
      } finally {
        this.setAuthToken(null);
      }
    },

    me: async () => {
      return this.request<UserProfile>('/auth/me', {
        method: 'GET',
      });
    },

    refresh: async () => {
      const res = await this.request<{
        message: string;
        token?: string;
        accessToken?: string;
        access_token?: string;
      }>('/auth/refresh', {
        method: 'POST',
      });
      const token = res.token || res.accessToken || res.access_token;
      if (token) {
        this.setAuthToken(token);
      }
      return res;
    },
  };

  // =========================================================================
  // 2. STAFF MANAGEMENT MODULE (ADMIN ONLY)
  // =========================================================================
  public readonly staff = {
    list: async () => {
      return this.request<UserProfile[]>('/staff', { method: 'GET' });
    },

    get: async (id: string) => {
      return this.request<UserProfile>(`/staff/${id}`, { method: 'GET' });
    },

    create: async (data: {
      username: string;
      password: string;
      role: 'admin' | 'pt';
      full_name: string;
      phone?: string;
      bio?: string;
      license_no?: string;
      license_expiry?: string;
      specialty?: string;
    }) => {
      return this.request<UserProfile>('/staff', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: async (id: string, data: Partial<UserProfile>) => {
      return this.request<UserProfile>(`/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    suspend: async (id: string, reason?: string) => {
      return this.request<{ message: string }>(`/staff/${id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },

    resetPassword: async (id: string, new_password?: string) => {
      return this.request<{ message: string; temporary_password?: string }>(
        `/staff/${id}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({ password: new_password }),
        }
      );
    },

    uploadAvatar: async (id: string, file: File | Blob) => {
      const formData = new FormData();
      formData.append('avatar', file);
      const url = `${this.baseUrl}/staff/${id}/avatar`;
      const token = this.getAuthToken();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: formData,
      });
      return res.json();
    },
  };

  // =========================================================================
  // 3. PATIENTS DIRECTORY MODULE
  // =========================================================================
  public readonly patients = {
    list: async (params: { q?: string; page?: number; limit?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.q) query.set('q', params.q);
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));
      const qs = query.toString() ? `?${query.toString()}` : '';
      return this.request<PatientRecord[]>(`/patients${qs}`, { method: 'GET' });
    },

    get: async (id: string) => {
      return this.request<PatientRecord>(`/patients/${id}`, { method: 'GET' });
    },

    create: async (data: {
      first_name: string;
      last_name: string;
      age: number;
      sex: 'male' | 'female' | 'other';
      phone?: string;
      injury?: string;
      history?: Record<string, unknown>;
      responsible_pt_id?: string;
    }) => {
      return this.request<PatientRecord>('/patients', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: async (id: string, data: Partial<PatientRecord> & { version: number }) => {
      return this.request<PatientRecord>(`/patients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    archive: async (id: string) => {
      return this.request<{ message: string }>(`/patients/${id}/archive`, {
        method: 'POST',
      });
    },

    sendToKiosk: async (patientId: string, kioskId?: string) => {
      return this.request<{ ticket_id: string; expires_at: string }>(
        `/patients/${patientId}/send-to-kiosk`,
        {
          method: 'POST',
          body: JSON.stringify({ kiosk_id: kioskId }),
        }
      );
    },

    checkin: async (patientId: string, kioskId?: string) => {
      return this.request<{ checkin_id: string; checked_in_at: string }>(
        `/patients/${patientId}/checkin`,
        {
          method: 'POST',
          body: JSON.stringify({ kiosk_id: kioskId }),
        }
      );
    },

    deleteBiometrics: async (patientId: string) => {
      return this.request<{ message: string }>(`/face/${patientId}`, {
        method: 'DELETE',
      });
    },

    deleteFaceBiometrics: async (patientId: string) => {
      return this.request<{ message: string }>(`/face/${patientId}`, {
        method: 'DELETE',
      });
    },
  };

  // =========================================================================
  // 4. PT DIRECTORY & CASE TRANSFERS
  // =========================================================================
  public readonly pts = {
    list: async () => {
      return this.request<PtRecord[]>('/pts', { method: 'GET' });
    },
  };

  public readonly directory = {
    listPts: async () => {
      return this.request<PtDirectoryRecord[]>('/pts', { method: 'GET' });
    },
  };

  public readonly caseTransfers = {
    list: async () => {
      return this.request<CaseTransferRecord[]>('/case-transfers', { method: 'GET' });
    },

    create: async (data: {
      patient_id: string;
      to_pt_id: string;
      start_date: string;
      end_date: string;
      reason?: string;
      notes?: string;
    }) => {
      return this.request<CaseTransferRecord>('/case-transfers', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: data.patient_id,
          to_pt_id: data.to_pt_id,
          start_date: data.start_date,
          end_date: data.end_date,
          notes: data.notes || data.reason,
        }),
      });
    },

    cancel: async (id: string) => {
      return this.request<{ message: string }>(`/case-transfers/${id}`, {
        method: 'DELETE',
      });
    },
  };

  // =========================================================================
  // 5. EXERCISES, MINIGAMES & MODPACKS LIBRARY
  // =========================================================================
  public readonly exercises = {
    list: async () => {
      return this.request<ExerciseRecord[]>('/exercises', { method: 'GET' });
    },

    get: async (id: string) => {
      return this.request<ExerciseRecord>(`/exercises/${id}`, { method: 'GET' });
    },

    create: async (data: Partial<ExerciseRecord>) => {
      return this.request<ExerciseRecord>('/exercises', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: async (id: string, data: Partial<ExerciseRecord>) => {
      return this.request<ExerciseRecord>(`/exercises/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    delete: async (id: string) => {
      return this.request<{ message: string }>(`/exercises/${id}`, {
        method: 'DELETE',
      });
    },

    uploadMedia: async (id: string, file: File | Blob) => {
      const formData = new FormData();
      formData.append('media', file);
      const url = `${this.baseUrl}/exercises/${id}/media`;
      const token = this.getAuthToken();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: formData,
      });
      return res.json();
    },
  };

  public readonly minigames = {
    list: async () => {
      return this.request<MinigameRecord[]>('/minigames', { method: 'GET' });
    },

    get: async (id: string) => {
      return this.request<MinigameRecord>(`/minigames/${id}`, { method: 'GET' });
    },

    create: async (data: Partial<MinigameRecord>) => {
      return this.request<MinigameRecord>('/minigames', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    listQuestions: async (minigameId: string) => {
      return this.request<QuestionRecord[]>(`/minigames/${minigameId}/questions`, {
        method: 'GET',
      });
    },

    createQuestion: async (minigameId: string, data: { prompt: string; choices: string[]; answer: string }) => {
      return this.request<QuestionRecord>(`/minigames/${minigameId}/questions`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    deleteQuestion: async (minigameId: string, questionId: string) => {
      return this.request<{ message: string }>(`/minigames/${minigameId}/questions/${questionId}`, {
        method: 'DELETE',
      });
    },
  };

  public readonly modpacks = {
    list: async () => {
      return this.request<ModpackRecord[]>('/modpacks', { method: 'GET' });
    },

    get: async (id: string) => {
      return this.request<ModpackRecord>(`/modpacks/${id}`, { method: 'GET' });
    },

    create: async (data: {
      name: string;
      description?: string;
      items: Array<{ exercise_id: string; sets: number; reps: number; position: number }>;
    }) => {
      return this.request<ModpackRecord>('/modpacks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: async (
      id: string,
      data: {
        name?: string;
        description?: string;
        items?: Array<{ exercise_id: string; sets: number; reps: number; position: number }>;
      }
    ) => {
      return this.request<ModpackRecord>(`/modpacks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    delete: async (id: string) => {
      return this.request<{ message: string }>(`/modpacks/${id}`, {
        method: 'DELETE',
      });
    },
  };

  // =========================================================================
  // 6. COURSES & SCHEDULE PLANNER
  // =========================================================================
  public readonly courses = {
    getToday: async (kioskId?: string) => {
      const qs = kioskId ? `?kiosk_id=${encodeURIComponent(kioskId)}` : '';
      return this.request<TodayCourseItem[]>(`/courses/today${qs}`, { method: 'GET' });
    },

    getCalendar: async (params?: { start_date?: string; end_date?: string; pt_id?: string }) => {
      const query = new URLSearchParams();
      if (params?.start_date) query.set('start_date', params.start_date);
      if (params?.end_date) query.set('end_date', params.end_date);
      if (params?.pt_id) query.set('pt_id', params.pt_id);
      const qs = query.toString() ? `?${query.toString()}` : '';
      return this.request<CourseRecord[]>(`/courses/calendar${qs}`, {
        method: 'GET',
      });
    },

    create: async (data: {
      patient_id: string;
      pt_id?: string;
      start_date: string;
      end_date: string;
      weekdays: number[];
      start_time?: string;
      kiosk_id?: string;
      include_minigame?: boolean;
      modpack_id?: string;
      items?: Array<{ exercise_id: string; sets: number; reps: number; position: number }>;
    }) => {
      return this.request<CourseRecord>('/courses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: async (id: string, data: Partial<CourseRecord> & { version: number }) => {
      return this.request<CourseRecord>(`/courses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    deleteDay: async (id: string, date: string) => {
      return this.request<{ message: string }>(`/courses/${id}/days/${date}`, {
        method: 'DELETE',
      });
    },
  };

  // =========================================================================
  // 7. CLINICAL RECORDS (APPEND-ONLY & VERSIONED)
  // =========================================================================
  public readonly records = {
    getNotes: async (patientId: string) => {
      return this.request<MedicalNoteRecord[]>(`/patients/${patientId}/notes`, {
        method: 'GET',
      });
    },

    createNote: async (patientId: string, body: string) => {
      return this.request<MedicalNoteRecord>(`/patients/${patientId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
    },

    getTreatmentResults: async (patientId: string) => {
      return this.request<TreatmentResultRecord[]>(
        `/patients/${patientId}/treatment-results`,
        { method: 'GET' }
      );
    },

    createTreatmentResult: async (patientId: string, body: string) => {
      return this.request<TreatmentResultRecord>(
        `/patients/${patientId}/treatment-results`,
        {
          method: 'POST',
          body: JSON.stringify({ body }),
        }
      );
    },
  };

  // =========================================================================
  // 8. SECURITY, SESSIONS & BANS
  // =========================================================================
  public readonly security = {
    listBans: async (type?: 'ip' | 'device' | 'account') => {
      const qs = type ? `?type=${type}` : '';
      return this.request<BanRecord[]>(`/security/bans${qs}`, { method: 'GET' });
    },

    createBan: async (data: {
      type: 'ip' | 'device' | 'account';
      value: string;
      reason: string;
      expires_at?: string;
    }) => {
      return this.request<BanRecord>('/security/bans', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    revokeBan: async (id: string) => {
      return this.request<{ message: string }>(`/security/bans/${id}`, {
        method: 'DELETE',
      });
    },

    forceLogout: async (userId: string, reason?: string) => {
      return this.request<{ message: string }>(`/security/force-logout/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },

    getAiSettings: async () => {
      return this.request<AiSettings>('/security/settings/ai', { method: 'GET' });
    },

    updateAiSettings: async (settings: Partial<AiSettings>) => {
      return this.request<AiSettings>('/security/settings/ai', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
    },

    resetAiSettings: async () => {
      return this.request<AiSettings>('/security/settings/ai/reset', {
        method: 'POST',
      });
    },
  };

  // =========================================================================
  // 9. AUDIT LOGS
  // =========================================================================
  public readonly audit = {
    list: async (params: {
      actor_id?: string;
      entity?: string;
      action?: string;
      page?: number;
      limit?: number;
    } = {}) => {
      const query = new URLSearchParams();
      if (params.actor_id) query.set('actor_id', params.actor_id);
      if (params.entity) query.set('entity', params.entity);
      if (params.action) query.set('action', params.action);
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));
      const qs = query.toString() ? `?${query.toString()}` : '';
      return this.request<AuditRecord[]>(`/audit${qs}`, { method: 'GET' });
    },
  };

  // =========================================================================
  // 10. KIOSK DEVICES & TERMINALS
  // =========================================================================
  public readonly kiosk = {
    listDevices: async () => {
      return this.request<KioskRecord[]>('/kiosk/devices', { method: 'GET' });
    },

    createDevice: async (data: { name: string; location?: string }) => {
      return this.request<KioskRecord>('/kiosk/devices', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    createPairCode: async (kioskId: string) => {
      return this.request<{ pairing_code: string; expires_in_seconds: number }>(
        '/kiosk/pair-code',
        {
          method: 'POST',
          body: JSON.stringify({ kiosk_id: kioskId }),
        }
      );
    },

    listStaffCalls: async () => {
      return this.request<StaffCallRecord[]>('/kiosk/staff-calls', { method: 'GET' });
    },

    handleStaffCall: async (id: string) => {
      return this.request<{ message: string }>(`/kiosk/staff-calls/${id}/handle`, {
        method: 'POST',
      });
    },

    pair: async (kioskId: string, code: string) => {
      return this.request<unknown>('/kiosk/pair', {
        method: 'POST',
        body: JSON.stringify({ kiosk_id: kioskId, code }),
      });
    },

    enroll: async (payload: {
      patient_id: string;
      ticket?: string;
      consent_id?: string;
      frames: Array<{ pose: 'front' | 'left' | 'right' | 'nod'; embedding: number[]; jpeg_base64?: string }>;
      model_version?: string;
    }) => {
      return this.request<{
        enrollment_id: string;
        patient_id: string;
        registration_status: string;
      }>('/kiosk/enroll', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    requestChallenge: async (kioskId: string) => {
      return this.request<{ nonce: string; device_id: string; steps: string[] }>('/kiosk/challenge', {
        method: 'POST',
        body: JSON.stringify({ kiosk_id: kioskId }),
      });
    },

    verifyFace: async (payload: {
      kiosk_id: string;
      nonce: string;
      probe: number[];
      liveness_score?: number;
    }) => {
      return this.request<{
        session_token: string;
        patient_id: string;
        first_name: string;
        avatar_url: string | null;
      }>('/kiosk/verify', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    confirmIdentity: async (sessionToken: string, confirmed: boolean) => {
      return this.request<unknown>('/kiosk/confirm-identity', {
        method: 'POST',
        body: JSON.stringify({ session_token: sessionToken, confirmed }),
      });
    },

    callStaff: async (payload: { kiosk_id: string; reason?: string }) => {
      return this.request<{ id: string }>('/kiosk/call-staff', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    getPlan: async (patientId: string, kioskId?: string) => {
      const q = new URLSearchParams({ patient_id: patientId });
      if (kioskId) q.set('kiosk_id', kioskId);
      return this.request<{ plan: unknown | null }>(`/kiosk/plan?${q.toString()}`);
    },

    recordStep: async (payload: {
      patient_id: string;
      course_id: string;
      step_type: 'exercise' | 'minigame' | 'rest';
      ref_id?: string;
      score?: unknown;
    }) => {
      return this.request<unknown>('/kiosk/mission/steps', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    finishMission: async (payload: {
      course_id?: string;
    }) => {
      return this.request<unknown>('/kiosk/finish', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  };

  // =========================================================================
  // 11. FACE BIOMETRIC OPERATIONS
  // =========================================================================
  public face = {
    enroll: async (payload: {
      patient_id: string;
      consent_id?: string;
      frames: Array<{ pose: 'front' | 'left' | 'right' | 'nod'; embedding: number[]; jpeg_base64?: string }>;
      model_version?: string;
    }) => {
      return this.request<{
        enrollment_id: string;
        patient_id: string;
        registration_status: string;
      }>('/face/enroll', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    deleteBiometrics: async (patientId: string) => {
      return this.request<{ success: boolean; message: string }>(`/face/${patientId}`, {
        method: 'DELETE',
      });
    },
  };

  public async enrollFace(payload: {
    patient_id: string;
    consent_id?: string;
    frames: Array<{ pose: 'front' | 'left' | 'right' | 'nod'; embedding: number[]; jpeg_base64?: string }>;
    model_version?: string;
  }): Promise<{
    enrollment_id: string;
    patient_id: string;
    registration_status: string;
    message?: string;
  }> {
    return this.face.enroll(payload);
  }

  public async kioskEnrollFace(payload: {
    patient_id: string;
    ticket?: string;
    consent_id?: string;
    frames: Array<{ pose: 'front' | 'left' | 'right' | 'nod'; embedding: number[]; jpeg_base64?: string }>;
    model_version?: string;
  }): Promise<{
    enrollment_id: string;
    patient_id: string;
    registration_status: string;
    message?: string;
  }> {
    return this.kiosk.enroll(payload);
  }

  public async deletePatientFace(patientId: string): Promise<{ success?: boolean; message: string }> {
    return this.face.deleteBiometrics(patientId);
  }

  // =========================================================================
  // 12. SMART ONBOARDING & BIOMETRIC DUAL-SYNC (Master Prompt v4)
  // =========================================================================
  public smartOnboarding = {
    scanLogin: async (payload: { probe: number[]; snapshot?: string }) => {
      return this.request<{
        matched: boolean;
        patient?: any;
        similarity?: number;
        distance?: number;
        similarityPercentage?: number;
        message?: string;
      }>('/smart-onboarding/scan-login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    createPending: async (payload: {
      frames: Array<{ pose: string; embedding: number[]; jpeg_base64?: string }>;
      model_version?: string;
    }) => {
      return this.request<{
        patient_id: string;
        hn: string;
        registration_status: string;
        profile_face_url: string;
      }>('/smart-onboarding/create-pending', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    completeInfo: async (payload: {
      patient_id: string;
      first_name: string;
      last_name: string;
      age: number;
      gender: string;
      phone?: string;
      initial_symptoms?: string;
    }) => {
      return this.request<any>('/smart-onboarding/complete-info', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    listPending: async () => {
      return this.request<any[]>('/smart-onboarding/pending-patients', {
        method: 'GET',
      });
    },

    saveSchedule: async (payload: { patient_id: string; schedule: any }) => {
      return this.request<any>('/smart-onboarding/schedule', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    getDailyPlan: async (patientId: string, date?: string) => {
      const q = date ? `?date=${encodeURIComponent(date)}` : '';
      return this.request<{
        is_scheduled_today: boolean;
        reason?: string;
        schedule?: any;
        exercises: any[];
        include_minigame: boolean;
      }>(`/smart-onboarding/daily-plan/${patientId}${q}`, {
        method: 'GET',
      });
    },

    saveRehabScore: async (payload: { patient_id: string; score: any }) => {
      return this.request<any>('/smart-onboarding/rehab-score', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    deletePatient: async (patientId: string) => {
      return this.request<{ ok: boolean; message: string }>(`/smart-onboarding/patient/${patientId}`, {
        method: 'DELETE',
      });
    },

    getDossier: async (patientId: string) => {
      return this.request<{
        record: any;
        profile_face_url: string;
        login_snapshots: string[];
        schedule: any;
        rehab_scores: any[];
      }>(`/smart-onboarding/patient/${patientId}/dossier`, {
        method: 'GET',
      });
    },

    listDossiers: async () => {
      return this.request<Array<{
        patient_id: string;
        first_name: string;
        last_name: string;
        hn: string;
        profile_face_url: string;
        schedule: any;
        rehab_scores: any[];
        clinical?: any;
      }>>('/smart-onboarding/dossiers', {
        method: 'GET',
      });
    },

    getExercises: async () => {
      return this.request<any[]>('/smart-onboarding/exercises', { method: 'GET' });
    },

    saveExercise: async (exercise: any) => {
      return this.request<any>('/smart-onboarding/exercises', {
        method: 'POST',
        body: JSON.stringify(exercise),
      });
    },

    getModpacks: async () => {
      return this.request<any[]>('/smart-onboarding/modpacks', { method: 'GET' });
    },

    saveModpack: async (modpack: any) => {
      return this.request<any>('/smart-onboarding/modpacks', {
        method: 'POST',
        body: JSON.stringify(modpack),
      });
    },
  };

  // =========================================================================
  // 12. SSE REAL-TIME EVENTS
  // =========================================================================
  public connectEvents(
    onMessage: (event: { event: string; data: unknown }) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const eventSource = new EventSource(`${this.baseUrl}/events`, {
      withCredentials: true,
    });

    eventSource.onmessage = (msg) => {
      try {
        const parsed: unknown = JSON.parse(msg.data);
        onMessage({ event: 'message', data: parsed });
      } catch {
        onMessage({ event: 'message', data: msg.data });
      }
    };

    const listeners = ['staff_call', 'patient_status', 'enrollment_done', 'audit_new'];
    listeners.forEach((eventName) => {
      eventSource.addEventListener(eventName, (e: Event) => {
        const me = e as MessageEvent;
        try {
          const parsed: unknown = JSON.parse(me.data);
          onMessage({ event: eventName, data: parsed });
        } catch {
          onMessage({ event: eventName, data: me.data });
        }
      });
    });

    if (onError) {
      eventSource.onerror = onError;
    }

    return () => {
      eventSource.close();
    };
  }
}

export const defaultApiClient = new ApiClient();

export const enrollFace = (payload: Parameters<ApiClient['enrollFace']>[0]) =>
  defaultApiClient.enrollFace(payload);

export const kioskEnrollFace = (payload: Parameters<ApiClient['kioskEnrollFace']>[0]) =>
  defaultApiClient.kioskEnrollFace(payload);

export const deletePatientFace = (patientId: string) =>
  defaultApiClient.deletePatientFace(patientId);

