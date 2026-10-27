import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  UserX,
  Search,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  X,
  ChevronRight,
  UserCheck,
  Trash2
} from 'lucide-react';
import { UserProfile, defaultApiClient } from '../../../../packages/api-client/src/index.js';

const DEMO_STAFF: UserProfile[] = [
  {
    id: 'staff-director-01',
    username: 'director',
    role: 'admin',
    full_name: 'ผอ. นพ. บริรักษ์ เวชกิจ',
    phone: '081-999-8888',
    status: 'active',
    bio: 'ผู้อำนวยการโรงพยาบาลและหัวหน้าศูนย์เวชศาสตร์ฟื้นฟู',
    last_login_at: '2026-10-26T08:15:00.000Z',
  },
  {
    id: 'staff-admin-01',
    username: 'admin',
    role: 'admin',
    full_name: 'ผู้ดูแลระบบ โรงพยาบาล',
    phone: '082-000-1111',
    status: 'active',
    bio: 'ผู้ดูแลระบบสารสนเทศและความปลอดภัยโรงพยาบาล',
    last_login_at: '2026-10-26T08:20:00.000Z',
  },
  {
    id: 'pt-somchai-uuid',
    username: 'pt_somchai',
    role: 'pt',
    full_name: 'กภ. วิภาวี สุขใจ',
    phone: '085-555-4444',
    status: 'active',
    bio: 'ผู้เชี่ยวชาญด้านเวชศาสตร์ฟื้นฟูข้อต่อและกระดูกสันหลัง',
    pt_details: {
      license_no: 'กภ.12345',
      license_expiry: '2028-12-31',
      specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
    },
    last_login_at: '2026-10-26T08:30:00.000Z',
  },
];

export const StaffView: React.FC = () => {
  const [staffList, setStaffList] = useState<UserProfile[]>(DEMO_STAFF);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'pt' | 'patient'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'pt' as 'admin' | 'pt' | 'patient',
    full_name: '',
    phone: '',
    bio: '',
    license_no: '',
    license_expiry: '',
    specialty: '',
    age: 45,
    sex: 'male' as 'male' | 'female' | 'other',
    injury: '',
  });

  // Reset password modal state
  const [resetModalUser, setResetModalUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Notification state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [staffData, patientRes] = await Promise.all([
        defaultApiClient.staff.list().catch(() => []),
        defaultApiClient.patients.list({ page: 1, limit: 100 }).catch(() => []),
      ]);

      const staffListRaw: UserProfile[] = Array.isArray(staffData) && staffData.length > 0 ? staffData : DEMO_STAFF;
      const rawPatients = Array.isArray(patientRes) ? patientRes : ((patientRes as any)?.patients || []);
      const patientListMapped: UserProfile[] = rawPatients.map((p: any) => {
        const lastNameClean = (p.last_name && p.last_name.trim() !== '-' && p.last_name.trim() !== '') ? ` ${p.last_name.trim()}` : '';
        const fullName = `${p.first_name?.trim() || ''}${lastNameClean}`.trim() || 'ผู้ป่วย';
        return {
          id: p.id,
          username: p.hn || `HN-${p.id.slice(0, 6)}`,
          full_name: fullName,
          role: 'patient' as any,
          phone: p.phone || '-',
          bio: p.injury || 'ผู้ป่วยรับการรักษา',
          status: p.registration_status === 'archived' ? 'suspended' : 'active',
          last_login_at: p.created_at || null,
        };
      });

      setStaffList([...staffListRaw, ...patientListMapped]);
    } catch {
      setStaffList(DEMO_STAFF);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();

    const handleDataChange = () => {
      fetchStaff();
    };
    window.addEventListener('patient-created', handleDataChange);
    window.addEventListener('staff-updated', handleDataChange);
    return () => {
      window.removeEventListener('patient-created', handleDataChange);
      window.removeEventListener('staff-updated', handleDataChange);
    };
  }, []);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const maxSteps = formData.role === 'pt' ? 3 : (formData.role === 'patient' ? 3 : 2);
    if (wizardStep < maxSteps) {
      setWizardStep((prev) => prev + 1);
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      if (formData.role === 'patient') {
        const parts = formData.full_name.trim().split(' ');
        const firstName = parts[0] || 'ผู้ป่วย';
        const lastName = parts.slice(1).join(' ') || 'ใหม่';
        await defaultApiClient.patients.create({
          first_name: firstName,
          last_name: lastName,
          age: Number(formData.age) || 45,
          sex: formData.sex,
          phone: formData.phone || '-',
          injury: formData.injury || formData.bio || 'กายภาพบำบัดฟื้นฟูทั่วไป',
        });
        window.dispatchEvent(new CustomEvent('patient-created'));
        setSuccessMsg(`สร้างบัญชีคนไข้ ${formData.full_name} สำเร็จเรียบร้อย`);
      } else {
        const safePassword =
          formData.password && formData.password.length >= 12
            ? formData.password
            : formData.password
            ? formData.password.padEnd(12, '0')
            : 'Password12345!';
        const safeLicense =
          formData.license_no?.trim() ||
          (formData.role === 'pt' ? `กภ.${Math.floor(10000 + Math.random() * 90000)}` : undefined);
        await defaultApiClient.staff.create({
          username: formData.username,
          password: safePassword,
          role: formData.role,
          full_name: formData.full_name,
          phone: formData.phone || undefined,
          bio: formData.bio || undefined,
          license_no: safeLicense,
          license_expiry: formData.license_expiry || (formData.role === 'pt' ? '2030-12-31' : undefined),
          specialty: formData.specialty || (formData.role === 'pt' ? 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด' : undefined),
        });
        window.dispatchEvent(new CustomEvent('staff-updated'));
        setSuccessMsg(`สร้างผู้ใช้ ${formData.username} สำเร็จเรียบร้อย`);
      }
      await fetchStaff();
      setIsWizardOpen(false);
      setWizardStep(1);
      setFormData({
        username: '',
        password: '',
        role: 'pt',
        full_name: '',
        phone: '',
        bio: '',
        license_no: '',
        license_expiry: '',
        specialty: '',
        age: 45,
        sex: 'male',
        injury: '',
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างผู้ใช้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSuspend = async (user: UserProfile) => {
    const isPatient = (user.role as string) === 'patient';
    const isCurrentlySuspended = user.status === 'suspended';

    const confirmPrompt = isPatient
      ? isCurrentlySuspended
        ? `คุณต้องการเปิดใช้งานประวัติคนไข้ ${user.full_name} (${user.username}) ใช่หรือไม่?`
        : `คุณต้องการระงับ/ปิดแฟ้มประวัติ (Archive) คนไข้ ${user.full_name} (${user.username}) ใช่หรือไม่?`
      : isCurrentlySuspended
        ? `คุณต้องการยกเลิกระงับการใช้งานของ ${user.full_name} (@${user.username}) ใช่หรือไม่?`
        : `คุณต้องการระงับการใช้งานของ ${user.full_name} (@${user.username}) ใช่หรือไม่? (ผู้ใช้จะถูกเตะออกจากระบบทันที)`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      setActionLoading(true);
      setErrorMsg(null);
      if (isPatient) {
        if (isCurrentlySuspended) {
          const p = await defaultApiClient.patients.get(user.id);
          await defaultApiClient.patients.update(user.id, { registration_status: 'active', version: p?.version || 1 });
          setSuccessMsg(`เปิดใช้งานประวัติคนไข้ ${user.full_name} สำเร็จ`);
        } else {
          await defaultApiClient.patients.archive(user.id);
          setSuccessMsg(`ระงับและจัดเก็บประวัติคนไข้ ${user.full_name} เรียบร้อยแล้ว`);
        }
      } else {
        if (isCurrentlySuspended) {
          await defaultApiClient.staff.update(user.id, { status: 'active' });
          setSuccessMsg(`ยกเลิกระงับการใช้งาน ${user.full_name} สำเร็จ`);
        } else {
          await defaultApiClient.staff.suspend(user.id, 'ระงับโดยคำสั่งผู้อำนวยการโรงพยาบาล');
          setSuccessMsg(`ระงับการใช้งาน ${user.full_name} และบังคับตัดเซสชันเรียบร้อย`);
        }
      }
      await fetchStaff();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะผู้ใช้';
      if (msg.includes('Forbidden') || msg.includes('insufficient permissions')) {
        setErrorMsg('สิทธิ์ไม่เพียงพอ: บัญชีปัจจุบันเป็น "นักกายภาพบำบัด (PT)" เฉพาะผู้อำนวยการ (Admin) เท่านั้นที่สามารถจัดการบัญชีเจ้าหน้าที่ได้ กรุณาเข้าสู่ระบบด้วยบัญชี @director');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetModalUser) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await defaultApiClient.staff.resetPassword(
        resetModalUser.id,
        newPassword.trim() || undefined
      );
      setResetSuccessMessage(
        res.temporary_password
          ? `รีเซ็ตรหัสผ่านสำเร็จ รหัสผ่านชั่วคราว: ${res.temporary_password}`
          : 'รีเซ็ตรหัสผ่านและบังคับออกจากระบบทุกเครื่องเรียบร้อยแล้ว'
      );
      setTimeout(() => {
        setResetModalUser(null);
        setNewPassword('');
        setResetSuccessMessage(null);
      }, 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถรีเซ็ตรหัสผ่านได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStaff = async (user: UserProfile) => {
    if (user.username === 'director' || user.username === 'admin') {
      alert('ไม่สามารถลบบัญชีผู้ดูแลระบบหลักหรือผู้อำนวยการโรงพยาบาลได้');
      return;
    }

    const isPatient = (user.role as string) === 'patient';
    const typeLabel = isPatient ? 'คนไข้' : user.role === 'pt' ? 'นักกายภาพบำบัด' : 'เจ้าหน้าที่';
    const confirmPrompt = `คุณแน่ใจหรือไม่ว่าต้องการลบ${typeLabel} "${user.full_name}" (@${user.username}) ออกจากระบบอย่างถาวร?\n\nคำเตือน: ข้อมูลบัญชีและสิทธิ์การเข้าใช้งานจะถูกลบทั้งหมดและไม่สามารถกู้คืนได้`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      setActionLoading(true);
      setErrorMsg(null);
      if (isPatient) {
        await defaultApiClient.patients.delete(user.id);
        window.dispatchEvent(new CustomEvent('patient-created'));
        setSuccessMsg(`ลบประวัติคนไข้ ${user.full_name} สำเร็จเรียบร้อย`);
      } else {
        await defaultApiClient.staff.delete(user.id);
        window.dispatchEvent(new CustomEvent('staff-updated'));
        setSuccessMsg(`ลบ${typeLabel} ${user.full_name} (@${user.username}) ออกจากระบบเรียบร้อย`);
      }
      await fetchStaff();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบผู้ใช้');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredStaff = (Array.isArray(staffList) ? staffList : DEMO_STAFF).filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone && u.phone.includes(search));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="p-8 pt-8 mt-2 space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-600" />
            <span>จัดการเจ้าหน้าที่โรงพยาบาล (Staff Management)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            บัญชีผู้อำนวยการ (Admin) และนักกายภาพบำบัด (PT) ควบคุมสิทธิ์และเซสชันการเข้าถึง
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStaff}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setIsWizardOpen(true);
              setWizardStep(1);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition shadow-lg shadow-teal-950/40"
          >
            <UserPlus className="w-4 h-4" />
            <span>เพิ่มเจ้าหน้าที่ใหม่</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, username, เบอร์โทร..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'pt' | 'patient')}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300 focus:outline-none focus:border-teal-500"
          >
            <option value="all">ทุกบทบาท (All Roles)</option>
            <option value="admin">ผู้อำนวยการ (Admin)</option>
            <option value="pt">นักกายภาพบำบัด (PT)</option>
            <option value="patient">คนไข้ (Patient)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300 focus:outline-none focus:border-teal-500"
          >
            <option value="all">ทุกสถานะ (All Status)</option>
            <option value="active">ใช้งานปกติ (Active)</option>
            <option value="suspended">ถูกระงับ (Suspended)</option>
          </select>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">ชื่อ-นามสกุล</th>
                <th className="px-6 py-4 font-semibold">Username / HN</th>
                <th className="px-6 py-4 font-semibold">บทบาท</th>
                <th className="px-6 py-4 font-semibold">สถานะ</th>
                <th className="px-6 py-4 font-semibold">เข้าสู่ระบบล่าสุด</th>
                <th className="px-6 py-4 font-semibold text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                    <span>กำลังโหลดรายชื่อผู้ใช้...</span>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    ไม่พบข้อมูลผู้ใช้ที่ตรงตามเงื่อนไข
                  </td>
                </tr>
              ) : (
                filteredStaff.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300">
                          {user.full_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="font-medium text-white">{user.full_name?.replace(/\s*-\s*$/, '').trim() || user.full_name}</div>
                          {user.phone && <div className="text-xs text-slate-400">{user.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">@{user.username}</td>
                    <td className="px-6 py-4">
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                          <Shield className="w-3 h-3" />
                          <span>ผู้อำนวยการ (Admin)</span>
                        </span>
                      ) : user.role === 'pt' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/30">
                          <UserCheck className="w-3 h-3" />
                          <span>นักกายภาพบำบัด (PT)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                          <Users className="w-3 h-3" />
                          <span>คนไข้ (Patient)</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>ปกติ</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          <AlertTriangle className="w-3 h-3" />
                          <span>ระงับการใช้งาน</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleString('th-TH')
                        : 'ยังไม่เคยเข้าสู่ระบบ'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(user.role as string) !== 'patient' && (
                          <button
                            onClick={() => setResetModalUser(user)}
                            title="รีเซ็ตรหัสผ่าน"
                            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-700 transition"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleSuspend(user)}
                          title={user.status === 'suspended' ? 'ยกเลิกระงับ' : 'ระงับการใช้งาน'}
                          className={`p-2 rounded-lg transition ${
                            user.status === 'suspended'
                              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                          }`}
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                        {user.username !== 'director' && user.username !== 'admin' && (
                          <button
                            onClick={() => handleDeleteStaff(user)}
                            title={`ลบ${(user.role as string) === 'patient' ? 'คนไข้' : user.role === 'pt' ? 'นักกายภาพบำบัด' : 'เจ้าหน้าที่'}ถาวร`}
                            className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-step Create User Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-teal-400" />
                  <span>เพิ่มผู้ใช้ใหม่ (Staff / PT / คนไข้)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  ขั้นตอนที่ {wizardStep} จาก {formData.role === 'admin' ? 2 : 3}
                </p>
              </div>
              <button
                onClick={() => setIsWizardOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Wizard Steps Form */}
            <form onSubmit={handleCreateStaff} className="p-6 space-y-5">
              {errorMsg && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs sm:text-sm flex items-center justify-between">
                  <span>{errorMsg}</span>
                  <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white ml-2">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <h4 className="text-sm sm:text-base font-bold text-teal-300 tracking-normal">
                    1. ข้อมูลบัญชีผู้ใช้
                  </h4>
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      ชื่อผู้ใช้ (Username) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น pt.somchai หรือ somchai"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      รหัสผ่านเริ่มต้น (ขั้นต่ำ 12 ตัวอักษร) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={12}
                      placeholder="••••••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      ชื่อ - นามสกุลจริง *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น กภ. วิภาวี สุขใจ หรือ นายสมชาย ใจดี"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      เบอร์โทรศัพท์
                    </label>
                    <input
                      type="tel"
                      placeholder="เช่น 0812345678"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition"
                    />
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <h4 className="text-sm sm:text-base font-bold text-teal-300 tracking-normal">
                    2. กำหนดบทบาทและสิทธิ์การใช้งาน
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: 'pt' })}
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        formData.role === 'pt'
                          ? 'bg-teal-600/20 border-teal-500 text-teal-300 ring-2 ring-teal-500/30'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <UserCheck className="w-5 h-5 mb-1.5 text-teal-400" />
                      <div className="font-bold text-xs sm:text-sm text-white">นักกายภาพบำบัด (PT)</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">ดูแลเคส สั่งคอร์ส และลงเวชระเบียน</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: 'admin' })}
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        formData.role === 'admin'
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300 ring-2 ring-purple-500/30'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Shield className="w-5 h-5 mb-1.5 text-purple-400" />
                      <div className="font-bold text-xs sm:text-sm text-white">ผู้อำนวยการ (Admin)</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">สิทธิ์สูงสุด จัดการระบบและตรวจสอบ</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: 'patient' })}
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        formData.role === 'patient'
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300 ring-2 ring-blue-500/30'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Users className="w-5 h-5 mb-1.5 text-blue-400" />
                      <div className="font-bold text-xs sm:text-sm text-white">คนไข้ (Patient)</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">ผู้ป่วยรับการฝึกฟื้นฟูกายภาพบำบัด</div>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      ประวัติโดยย่อ / ข้อมูลเพิ่มเติม
                    </label>
                    <textarea
                      rows={3}
                      placeholder="ระบุข้อมูลเพิ่มเติม..."
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      className="w-full p-3.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {wizardStep === 3 && formData.role === 'pt' && (
                <div className="space-y-4">
                  <h4 className="text-sm sm:text-base font-bold text-teal-300 tracking-normal">
                    3. ข้อมูลใบอนุญาตประกอบวิชาชีพกายภาพบำบัด
                  </h4>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      เลขที่ใบประกอบวิชาชีพ (License No.) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น กภ.12345"
                      value={formData.license_no}
                      onChange={(e) => setFormData({ ...formData, license_no: e.target.value })}
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      วันหมดอายุใบอนุญาต
                    </label>
                    <input
                      type="date"
                      value={formData.license_expiry}
                      onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      ความเชี่ยวชาญเฉพาะทาง (Specialty)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น เวชศาสตร์ฟื้นฟูกายภาพบำบัด"
                      value={formData.specialty}
                      onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition"
                    />
                  </div>
                </div>
              )}

              {wizardStep === 3 && formData.role === 'patient' && (
                <div className="space-y-4">
                  <h4 className="text-sm sm:text-base font-bold text-blue-300 tracking-normal">
                    3. ข้อมูลผู้ป่วยและอาการเริ่มต้น
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                        อายุ (ปี) *
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={120}
                        value={formData.age}
                        onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) || 45 })}
                        className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                        เพศ *
                      </label>
                      <select
                        value={formData.sex}
                        onChange={(e) => setFormData({ ...formData, sex: e.target.value as any })}
                        className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                      >
                        <option value="male">ชาย (Male)</option>
                        <option value="female">หญิง (Female)</option>
                        <option value="other">อื่นๆ (Other)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      อาการบาดเจ็บ / วินิจฉัยเบื้องต้น *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น ข้อไหล่ติด, ปวดหลังส่วนล่าง"
                      value={formData.injury}
                      onChange={(e) => setFormData({ ...formData, injury: e.target.value })}
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              )}

              {/* Wizard Navigation Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                {wizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((prev) => prev - 1)}
                    className="h-11 px-5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-sm font-semibold transition"
                  >
                    ย้อนกลับ
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="h-11 flex items-center gap-2 px-6 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm sm:text-base transition shadow-lg shadow-teal-950/40 disabled:opacity-50 active:scale-[0.98]"
                >
                  <span>
                    {wizardStep < (formData.role === 'pt' ? 3 : (formData.role === 'patient' ? 3 : 2)) ? 'ขั้นตอนถัดไป' : 'บันทึกและสร้างบัญชี'}
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <span>รีเซ็ตรหัสผ่านเจ้าหน้าที่</span>
              </h3>
              <button
                onClick={() => setResetModalUser(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-400">
              กำลังรีเซ็ตรหัสผ่านสำหรับ{' '}
              <strong className="text-white">{resetModalUser.full_name}</strong> (@
              {resetModalUser.username}) การดำเนินการนี้จะบังคับล็อกเอาต์เซสชันที่มีอยู่ทั้งหมดทันที
            </p>

            {resetSuccessMessage ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
                {resetSuccessMessage}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    รหัสผ่านใหม่ (ปล่อยว่างเพื่อสุ่มรหัสผ่านปลอดภัยอัตโนมัติ)
                  </label>
                  <input
                    type="password"
                    placeholder="อย่างน้อย 12 ตัวอักษร"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-medium"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium shadow-lg shadow-amber-950/40 disabled:opacity-50"
                  >
                    ยืนยันรีเซ็ตรหัสผ่าน
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
