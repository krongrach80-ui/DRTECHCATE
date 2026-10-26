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
  UserCheck
} from 'lucide-react';
import { UserProfile, defaultApiClient } from '../../../../packages/api-client/src/index.js';

const DEMO_STAFF: UserProfile[] = [
  {
    id: 'staff-director-01',
    username: 'director',
    role: 'admin',
    full_name: 'ผอ. นพ. วิจัย สุขเกษม (Hospital Director)',
    phone: '081-999-8888',
    status: 'active',
    bio: 'ผู้อำนวยการโรงพยาบาลและหัวหน้าศูนย์เวชศาสตร์ฟื้นฟู',
    last_login_at: '2026-10-26T08:15:00.000Z',
  },
  {
    id: 'staff-admin-01',
    username: 'admin',
    role: 'admin',
    full_name: 'ผู้ดูแลระบบโรงพยาบาล (Hospital Administrator)',
    phone: '082-000-1111',
    status: 'active',
    bio: 'ผู้ดูแลระบบสารสนเทศและความปลอดภัยโรงพยาบาล',
    last_login_at: '2026-10-26T08:20:00.000Z',
  },
  {
    id: 'pt-somchai-uuid',
    username: 'pt_somchai',
    role: 'pt',
    full_name: 'กภ. ภัทรพล เจริญสุข (นักกายภาพบำบัดชำนาญการ)',
    phone: '085-555-4444',
    status: 'active',
    bio: 'ผู้เชี่ยวชาญด้านเวชศาสตร์ฟื้นฟูข้อต่อและกระดูกสันหลัง',
    pt_details: {
      license_no: 'กภ.12345',
      license_expiry: '2028-12-31',
      specialty: 'เวชศาสตร์ฟื้นฟูข้อและกล้ามเนื้อ',
    },
    last_login_at: '2026-10-26T08:30:00.000Z',
  },
];

export const StaffView: React.FC = () => {
  const [staffList, setStaffList] = useState<UserProfile[]>(DEMO_STAFF);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'pt'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'pt' as 'admin' | 'pt',
    full_name: '',
    phone: '',
    bio: '',
    license_no: '',
    license_expiry: '',
    specialty: '',
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
      const data = await defaultApiClient.staff.list().catch(() => []);
      const safe = Array.isArray(data) && data.length > 0 ? data : DEMO_STAFF;
      setStaffList(safe);
    } catch {
      setStaffList(DEMO_STAFF);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wizardStep < (formData.role === 'pt' ? 3 : 2)) {
      setWizardStep((prev) => prev + 1);
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      await defaultApiClient.staff.create(formData);
      setSuccessMsg(`สร้างผู้ใช้ ${formData.username} สำเร็จเรียบร้อย`);
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
      });
      await fetchStaff();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างเจ้าหน้าที่');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSuspend = async (user: UserProfile) => {
    const isCurrentlySuspended = user.status === 'suspended';
    const confirmPrompt = isCurrentlySuspended
      ? `คุณต้องการยกเลิกระงับการใช้งานของ ${user.full_name} (@${user.username}) ใช่หรือไม่?`
      : `คุณต้องการระงับการใช้งานของ ${user.full_name} (@${user.username}) ใช่หรือไม่? (ผู้ใช้จะถูกเตะออกจากระบบทันที)`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      setActionLoading(true);
      if (isCurrentlySuspended) {
        await defaultApiClient.staff.update(user.id, { status: 'active' });
        setSuccessMsg(`ยกเลิกระงับการใช้งาน ${user.full_name} สำเร็จ`);
      } else {
        await defaultApiClient.staff.suspend(user.id, 'ระงับโดยคำสั่งผู้อำนวยการโรงพยาบาล');
        setSuccessMsg(`ระงับการใช้งาน ${user.full_name} และบังคับตัดเซสชันเรียบร้อย`);
      }
      await fetchStaff();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะผู้ใช้');
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
    <div className="p-8 space-y-6">
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
            onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'pt')}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300 focus:outline-none focus:border-teal-500"
          >
            <option value="all">ทุกตำแหน่ง (All Roles)</option>
            <option value="admin">ผู้อำนวยการ (Admin)</option>
            <option value="pt">นักกายภาพบำบัด (PT)</option>
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
                <th className="px-6 py-4 font-semibold">เจ้าหน้าที่</th>
                <th className="px-6 py-4 font-semibold">Username</th>
                <th className="px-6 py-4 font-semibold">ตำแหน่ง</th>
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
                    <span>กำลังโหลดรายชื่อเจ้าหน้าที่...</span>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    ไม่พบข้อมูลเจ้าหน้าที่ตรงตามเงื่อนไข
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
                          <div className="font-medium text-white">{user.full_name}</div>
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
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/30">
                          <UserCheck className="w-3 h-3" />
                          <span>นักกายภาพบำบัด (PT)</span>
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
                        <button
                          onClick={() => setResetModalUser(user)}
                          title="รีเซ็ตรหัสผ่าน"
                          className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-700 transition"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleSuspend(user)}
                          title={user.status === 'suspended' ? 'ยกเลิกระงับ' : 'ระงับการใช้งาน'}
                          className={`p-2 rounded-lg transition ${
                            user.status === 'suspended'
                              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                          }`}
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-step Create Staff Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-teal-400" />
                  <span>เพิ่มเจ้าหน้าที่ใหม่ (สร้างผ่านระบบ)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  ขั้นตอนที่ {wizardStep} จาก {formData.role === 'pt' ? 3 : 2}
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
                      placeholder="เช่น staff.pt"
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
                      placeholder="เช่น กภ. ธนกฤต จิตมั่น"
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
                    2. กำหนดตำแหน่งและสิทธิ์การเข้าถึง
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: 'pt' })}
                      className={`p-4 rounded-2xl border text-left transition ${
                        formData.role === 'pt'
                          ? 'bg-teal-600/20 border-teal-500 text-teal-300 ring-2 ring-teal-500/30'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <UserCheck className="w-6 h-6 mb-2 text-teal-400" />
                      <div className="font-bold text-sm sm:text-base text-white">นักกายภาพบำบัด (PT)</div>
                      <div className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                        ดูแลคนไข้ของตนเอง สั่งคอร์ส และลงเวชระเบียน
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: 'admin' })}
                      className={`p-4 rounded-2xl border text-left transition ${
                        formData.role === 'admin'
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300 ring-2 ring-purple-500/30'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Shield className="w-6 h-6 mb-2 text-purple-400" />
                      <div className="font-bold text-sm sm:text-base text-white">ผู้อำนวยการ (Admin)</div>
                      <div className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                        สิทธิ์สูงสุด จัดการบุคลากร ความปลอดภัย และตรวจสอบ Audit
                      </div>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                      ประวัติโดยย่อ / ข้อมูลเพิ่มเติม
                    </label>
                    <textarea
                      rows={3}
                      placeholder="ระบุประวัติการศึกษา หรือข้อมูลเพิ่มเติม..."
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
                      placeholder="เช่น ก.12345"
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
                      placeholder="เช่น กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (MSK)"
                      value={formData.specialty}
                      onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-700/80 rounded-xl text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition"
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
                    {wizardStep < (formData.role === 'pt' ? 3 : 2) ? 'ขั้นตอนถัดไป' : 'บันทึกและสร้างบัญชี'}
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
