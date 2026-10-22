'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  UserCheck,
  User,
  ScanFace,
  Power,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronRight,
} from 'lucide-react';
import FaceEnrollmentScanner from '@/components/face/FaceEnrollmentScanner';
import { UserRole, FacePose } from '@/types/database';

interface UserRecord {
  id: string;
  role: UserRole;
  username: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  force_logout_at: string | null;
  created_at: string;
  patients?: {
    date_of_birth: string | null;
    sex: string | null;
    chief_complaint: string | null;
    diagnosis: string | null;
    allergies: string | null;
    chronic_diseases: string | null;
    emergency_contact: string | null;
  } | null;
  pts?: {
    license_no: string;
    license_expiry: string | null;
    specialty: string | null;
  } | null;
  face_enrollments?: {
    id: string;
    status: string;
    created_at: string;
  }[] | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'pt' | 'patient'>('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Wizard Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [createdUserForFace, setCreatedUserForFace] = useState<{ id: string; username: string; full_name: string } | null>(null);

  // Form Fields
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'patient' as UserRole,
    // Patient
    date_of_birth: '',
    sex: 'male' as 'male' | 'female' | 'other',
    chief_complaint: '',
    diagnosis: '',
    allergies: '',
    chronic_diseases: '',
    emergency_contact: '',
    // PT
    license_no: '',
    license_expiry: '',
    specialty: '',
  });

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch users list
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?role=${roleFilter}&search=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      if (res.ok && data.users) {
        setUsers(data.users);
      } else {
        setUsers([]);
      }
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, searchTerm]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Handle Step 1 Submit
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSubmitting(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'สร้างผู้ใช้ไม่สำเร็จ');
      }

      // Step 1 success! Transition to Step 2 (Face Enrollment)
      setCreatedUserForFace(data.user);
      setWizardStep(2);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Face Enrollment Complete (Step 2)
  const handleFaceEnrollmentComplete = async (
    frames: { pose: FacePose; embedding: number[]; image_base64: string }[]
  ) => {
    if (!createdUserForFace) return;
    try {
      const res = await fetch('/api/face/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: createdUserForFace.id,
          consent_text_version: 'v1.0-2026',
          frames,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'บันทึกใบหน้าไม่สำเร็จ');
      }

      setNotification({ type: 'success', message: `สร้างผู้ใช้ ${createdUserForFace.username} และลงทะเบียนใบหน้า 10 เฟรมสำเร็จ!` });
      closeModal();
      fetchUsers();
    } catch (err: unknown) {
      setNotification({ type: 'error', message: `เกิดข้อผิดพลาดในการบันทึกใบหน้า: ${err instanceof Error ? err.message : String(err)}` });
      closeModal();
      fetchUsers();
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setWizardStep(1);
    setCreatedUserForFace(null);
    setFormError(null);
    setFormData({
      username: '',
      password: '',
      full_name: '',
      phone: '',
      role: 'patient',
      date_of_birth: '',
      sex: 'male',
      chief_complaint: '',
      diagnosis: '',
      allergies: '',
      chronic_diseases: '',
      emergency_contact: '',
      license_no: '',
      license_expiry: '',
      specialty: '',
    });
  };

  // Toggle User Active Status
  const handleToggleActive = async (user: UserRecord) => {
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      if (res.ok) {
        setNotification({ type: 'success', message: `${user.is_active ? 'ระงับ' : 'เปิด'} การใช้งานผู้ใช้ ${user.username} เรียบร้อยแล้ว` });
        fetchUsers();
      }
    } catch {
      setNotification({ type: 'error', message: 'ไม่สามารถเปลี่ยนสถานะผู้ใช้ได้' });
    }
  };

  // Force Logout User
  const handleForceLogout = async (user: UserRecord) => {
    if (!confirm(`คุณต้องการบังคับออกจากระบบ (Force Logout) สำหรับ ${user.username} หรือไม่?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_logout: true }),
      });
      if (res.ok) {
        setNotification({ type: 'success', message: `บังคับ ${user.username} ออกจากระบบและยกเลิกเซสชันสำเร็จ` });
        fetchUsers();
      }
    } catch {
      setNotification({ type: 'error', message: 'ไม่สามารถบังคับออกจากระบบได้' });
    }
  };

  // Delete Biometrics (PDPA)
  const handleDeleteBiometrics = async (user: UserRecord) => {
    if (!confirm(`ยืนยันการลบข้อมูลใบหน้าและภาพชีวมาตรทั้งหมดของ ${user.full_name} (${user.username}) ตามสิทธิ PDPA หรือไม่?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotification({ type: 'success', message: `ลบข้อมูลชีวมาตรของ ${user.username} ออกจากระบบเรียบร้อยแล้ว` });
        fetchUsers();
      }
    } catch {
      setNotification({ type: 'error', message: 'เกิดข้อผิดพลาดในการลบข้อมูลชีวมาตร' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-sky-400" />
            <span>จัดการผู้ใช้งาน (User Management)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            สร้างและบริหารบัญชีบุคลากร (Admin, PT) และคนไข้ (Patient) พร้อมลงทะเบียนใบหน้าแบบ iPhone Face ID
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-xs font-semibold rounded-xl glow-btn transition-all cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>เพิ่มผู้ใช้ใหม่ (Wizard 2 ขั้นตอน)</span>
        </button>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาชื่อ, username, เบอร์โทร..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950/70 p-1.5 rounded-xl border border-slate-800/80 w-full sm:w-auto overflow-x-auto">
          {(['all', 'admin', 'pt', 'patient'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                roleFilter === r
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {r === 'all' ? 'ทั้งหมด' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5 font-semibold">ผู้ใช้งาน</th>
                <th className="px-4 py-3.5 font-semibold">บทบาท (Role)</th>
                <th className="px-4 py-3.5 font-semibold">สถานะชีวมาตร (Face)</th>
                <th className="px-4 py-3.5 font-semibold">สถานะบัญชี</th>
                <th className="px-5 py-3.5 font-semibold text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    <div className="inline-block w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mb-2" />
                    <div>กำลังโหลดข้อมูลผู้ใช้...</div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    ไม่พบข้อมูลผู้ใช้งานในระบบ
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const hasFace = u.face_enrollments && u.face_enrollments.length > 0;
                  return (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                      {/* Name & Username */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-white">{u.full_name}</div>
                        <div className="text-slate-400 text-[11px] font-mono mt-0.5">@{u.username}</div>
                        {u.phone && <div className="text-slate-500 text-[11px] mt-0.5">📞 {u.phone}</div>}
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                            u.role === 'admin'
                              ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                              : u.role === 'pt'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          }`}
                        >
                          {u.role === 'admin' ? (
                            <Shield className="w-3 h-3" />
                          ) : u.role === 'pt' ? (
                            <UserCheck className="w-3 h-3" />
                          ) : (
                            <User className="w-3 h-3" />
                          )}
                          <span className="uppercase">{u.role}</span>
                        </span>
                        {u.role === 'pt' && u.pts && (
                          <div className="text-[10px] text-slate-400 mt-1">ว.{u.pts.license_no}</div>
                        )}
                      </td>

                      {/* Face Enrollment Status */}
                      <td className="px-4 py-4">
                        {hasFace ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>สแกนหน้าแล้ว (10 เฟรม)</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">ยังไม่ลงทะเบียน</span>
                        )}
                      </td>

                      {/* Account Status */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            u.is_active
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span>{u.is_active ? 'เปิดใช้งาน' : 'ระงับบัญชี'}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {/* Force Logout Button */}
                          <button
                            type="button"
                            onClick={() => handleForceLogout(u)}
                            title="บังคับออกจากระบบ (Force Logout)"
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>

                          {/* Toggle Active/Inactive */}
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            title={u.is_active ? 'ระงับการใช้งาน' : 'เปิดใช้งาน'}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              u.is_active
                                ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
                                : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>

                          {/* Delete Biometrics (PDPA) */}
                          {hasFace && (
                            <button
                              type="button"
                              onClick={() => handleDeleteBiometrics(u)}
                              title="ลบข้อมูลชีวมาตรใบหน้า (PDPA Right to Erasure)"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            >
                              <ScanFace className="w-4 h-4 text-rose-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Wizard Modal (Step 1 & Step 2) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          {wizardStep === 1 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl relative my-8">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div>
                  <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">
                    ขั้นตอนที่ 1 จาก 2
                  </span>
                  <h3 className="text-lg font-bold text-white">ข้อมูลพื้นฐานและกำหนดบทบาท</h3>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleStep1Submit} className="space-y-4">
                {/* Role Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    บทบาทผู้ใช้งาน (Role)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['patient', 'pt', 'admin'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormData({ ...formData, role: r })}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-semibold capitalize flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          formData.role === r
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm'
                            : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {r === 'admin' ? (
                          <Shield className="w-3.5 h-3.5" />
                        ) : r === 'pt' ? (
                          <UserCheck className="w-3.5 h-3.5" />
                        ) : (
                          <User className="w-3.5 h-3.5" />
                        )}
                        <span>{r}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Username & Full Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">ชื่อผู้ใช้ (Username) *</label>
                    <input
                      type="text"
                      required
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="เช่น somchai_pt"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">ชื่อ - นามสกุล *</label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="เช่น นายสมชาย ใจดี"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Password & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">รหัสผ่าน (ขั้นต่ำ 12 ตัวอักษร) *</label>
                    <input
                      type="password"
                      required
                      minLength={12}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="อย่างน้อย 12 ตัวอักษร"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">เบอร์โทรศัพท์</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="081-234-5678"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Role Specific Sub-forms */}
                {formData.role === 'patient' && (
                  <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-3">
                    <div className="text-xs font-semibold text-sky-400">ข้อมูลการซักประวัติคนไข้</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">วัน/เดือน/ปีเกิด</label>
                        <input
                          type="date"
                          value={formData.date_of_birth}
                          onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">เพศ</label>
                        <select
                          value={formData.sex}
                          onChange={(e) => setFormData({ ...formData, sex: e.target.value as 'male' | 'female' | 'other' })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs"
                        >
                          <option value="male">ชาย</option>
                          <option value="female">หญิง</option>
                          <option value="other">อื่นๆ</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">อาการสำคัญที่มาพบ (Chief Complaint)</label>
                      <input
                        type="text"
                        value={formData.chief_complaint}
                        onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
                        placeholder="เช่น ปวดหลังส่วนล่างร้าวลงขาขวา 2 สัปดาห์"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">การวินิจฉัย (Diagnosis)</label>
                        <input
                          type="text"
                          value={formData.diagnosis}
                          onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                          placeholder="เช่น Lumbar Radiculopathy"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">ประวัติแพ้ยา / โรคประจำตัว</label>
                        <input
                          type="text"
                          value={formData.allergies}
                          onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                          placeholder="เช่น ไม่มี / ความดันโลหิตสูง"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formData.role === 'pt' && (
                  <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-3">
                    <div className="text-xs font-semibold text-emerald-400">ข้อมูลวิชาชีพนักกายภาพบำบัด</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">เลขที่ใบประกอบวิชาชีพ *</label>
                        <input
                          type="text"
                          required
                          value={formData.license_no}
                          onChange={(e) => setFormData({ ...formData, license_no: e.target.value })}
                          placeholder="เช่น ก.12345"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">วันหมดอายุใบอนุญาต</label>
                        <input
                          type="date"
                          value={formData.license_expiry}
                          onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">ความเชี่ยวชาญเฉพาะทาง</label>
                      <input
                        type="text"
                        value={formData.specialty}
                        onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                        placeholder="เช่น ระบบกล้ามเนื้อและกระดูก, กายภาพบำบัดระบบประสาท"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 glow-btn transition-all cursor-pointer flex items-center gap-2"
                  >
                    {formSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>กำลังบันทึกข้อมูล...</span>
                      </>
                    ) : (
                      <>
                        <span>ถัดไป: สแกนใบหน้า</span>
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Wizard Step 2: Face Enrollment Scanner */
            <FaceEnrollmentScanner
              userId={createdUserForFace?.id || ''}
              userName={createdUserForFace?.full_name || ''}
              onComplete={handleFaceEnrollmentComplete}
              onCancel={() => {
                setNotification({ type: 'success', message: `สร้างผู้ใช้ ${createdUserForFace?.username} เรียบร้อยแล้ว (ข้ามการลงทะเบียนใบหน้า)` });
                closeModal();
                fetchUsers();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
