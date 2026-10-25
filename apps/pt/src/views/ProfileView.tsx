import React, { useState, useEffect, useCallback } from 'react';
import {
  UserCheck,
  Award,
  FileBadge,
  AlertTriangle,
  CheckCircle2,
  X,
  Save,
  Camera,
  Users,
  Calendar,
  Share2,
  Clock,
  ClipboardList
} from 'lucide-react';
import {
  UserProfile,
  PatientRecord,
  PtRecord,
  CaseTransferRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';

interface ProfileViewProps {
  currentUser: UserProfile;
  onProfileUpdated: () => void;
  onNavigateToTab?: (tab: any, patientId?: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  onProfileUpdated,
  onNavigateToTab,
}) => {
  // Section 1: My Profile Form State
  const [formData, setFormData] = useState({
    full_name: currentUser.full_name || '',
    phone: currentUser.phone || '',
    bio: currentUser.bio || '',
    specialty: currentUser.pt_details?.specialty || '',
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Section 2: Case Delegation State
  const [myPatients, setMyPatients] = useState<PatientRecord[]>([]);
  const [activePtList, setActivePtList] = useState<PtRecord[]>([]);
  const [transfers, setTransfers] = useState<CaseTransferRecord[]>([]);
  const [isDelegationModalOpen, setIsDelegationModalOpen] = useState(false);
  const [delegationFormData, setDelegationFormData] = useState(() => ({
    patient_id: '',
    covering_pt_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    notes: '-',
  }));

  const fetchCasesAndTransfers = useCallback(async () => {
    try {
      const [allPatients, allPts, allTransfers] = await Promise.all([
        defaultApiClient.patients.list({ limit: 100 }),
        defaultApiClient.pts.list().catch(() => []),
        defaultApiClient.caseTransfers.list().catch(() => []),
      ]);

      const assigned = allPatients.filter(
        (p) => p.responsible_pt_id === currentUser.id
      );
      setMyPatients(assigned);
      setActivePtList(allPts.filter((p) => p.user_id !== currentUser.id));
      setTransfers(allTransfers);

      if (assigned.length > 0 && !delegationFormData.patient_id) {
        setDelegationFormData((prev) => ({
          ...prev,
          patient_id: assigned[0].id,
        }));
      }
      if (allPts.length > 0 && !delegationFormData.covering_pt_id) {
        const otherPt = allPts.find((p) => p.user_id !== currentUser.id);
        if (otherPt) {
          setDelegationFormData((prev) => ({
            ...prev,
            covering_pt_id: otherPt.user_id,
          }));
        }
      }
    } catch {
      // non-blocking
    }
  }, [currentUser.id, delegationFormData.patient_id, delegationFormData.covering_pt_id]);

  useEffect(() => {
    fetchCasesAndTransfers();
  }, [fetchCasesAndTransfers]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMsg(null);
      await defaultApiClient.staff.update(currentUser.id, {
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || undefined,
        bio: formData.bio.trim() || undefined,
        specialty: formData.specialty.trim() || undefined,
      });

      setSuccessMsg('บันทึกข้อมูลส่วนตัวเรียบร้อย');
      onProfileUpdated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถอัปเดตข้อมูลส่วนตัวได้');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setErrorMsg(null);
      await defaultApiClient.staff.uploadAvatar(currentUser.id, file);
      setSuccessMsg('อัปโหลดรูปโปรไฟล์เรียบร้อย');
      onProfileUpdated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถอัปโหลดรูปโปรไฟล์ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delegationFormData.patient_id || !delegationFormData.covering_pt_id) {
      setErrorMsg('กรุณาเลือกคนไข้และนักกายภาพผู้รับฝากเคส');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      await defaultApiClient.caseTransfers.create({
        patient_id: delegationFormData.patient_id,
        to_pt_id: delegationFormData.covering_pt_id,
        start_date: delegationFormData.start_date,
        end_date: delegationFormData.end_date,
        notes: delegationFormData.notes.trim() || '-',
      });

      setSuccessMsg('บันทึกการฝากเคสชั่วคราวสำเร็จ (มอบสิทธิ์ดูแลตารางฝึกให้ผู้รับฝากเรียบร้อย)');
      setIsDelegationModalOpen(false);
      await fetchCasesAndTransfers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกการฝากเคสได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDelegation = async (id: string) => {
    if (!window.confirm('คุณต้องการยกเลิกการฝากเคสนี้ใช่หรือไม่?')) return;
    try {
      setLoading(true);
      await defaultApiClient.caseTransfers.cancel(id);
      setSuccessMsg('ยกเลิกการฝากเคสเรียบร้อย');
      await fetchCasesAndTransfers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถยกเลิกการฝากเคสได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl space-y-8 font-sans">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <UserCheck className="w-6 h-6 text-teal-600" />
          <span>พื้นที่ทำงานส่วนตัว & การฝากเคส (PT Workspace & Case Delegation)</span>
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          จัดการข้อมูลการติดต่อ ความเชี่ยวชาญ และระบบฝากเคสชั่วคราวตามมาตรฐานโรงพยาบาล
        </p>
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

      {/* SECTION 1: MY PROFILE (ข้อมูลส่วนตัวของฉัน) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-teal-400" />
            <span>ส่วนที่ 1: ข้อมูลส่วนตัวของฉัน (My Profile)</span>
          </h3>
          <span className="text-xs text-slate-400">
            อัปเดตข้อมูลและเลขใบประกอบวิชาชีพ
          </span>
        </div>

        {/* Top: Avatar & Identity Header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-slate-800/80">
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-teal-500/20 overflow-hidden border border-teal-400/30">
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{currentUser.full_name?.charAt(0) || 'P'}</span>
              )}
            </div>
            <label
              className="absolute bottom-0 right-0 p-2 rounded-xl bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700 cursor-pointer shadow transition"
              title="เปลี่ยนรูปภาพโปรไฟล์"
            >
              <Camera className="w-4 h-4" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-2 text-center sm:text-left flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h3 className="text-xl font-bold text-white">{currentUser.full_name}</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                นักกายภาพบำบัด (Physical Therapist)
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              ชื่อผู้ใช้ในระบบ: @{currentUser.username}
            </div>

            <div className="flex flex-wrap gap-3 pt-2 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                <FileBadge className="w-4 h-4 text-teal-400" />
                <span>
                  เลขที่ใบประกอบวิชาชีพ (Read-Only): <strong>{currentUser.pt_details?.license_no || 'ก.ภ. 10842'}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                <Award className="w-4 h-4 text-cyan-400" />
                <span>แผนก (Read-Only): <strong>{currentUser.pt_details?.specialty || 'Musculoskeletal PT'}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleUpdateProfile} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                ชื่อ-นามสกุลจริง
              </label>
              <input
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                เบอร์โทรศัพท์ติดต่อ
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              ความเชี่ยวชาญเพิ่มเติม
            </label>
            <input
              type="text"
              value={formData.specialty}
              onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
              placeholder="เช่น กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ, ระบบประสาท, กีฬา"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              คำแนะนำตัว & ประวัติย่อ (Bio)
            </label>
            <textarea
              rows={3}
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="ข้อมูลแนะนำตัว ความเชี่ยวชาญเฉพาะทาง หรือเวลาปฏิบัติงาน..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'กำลังบันทึก...' : 'บันทึกข้อมูลส่วนตัว'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: ASSIGNED CASES & TEMPORARY CASE DELEGATION (เคสในความดูแล & ฝากเคสชั่วคราว) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span>ส่วนที่ 2: เคสในความดูแล & การฝากเคสชั่วคราว (My Cases & Delegation)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              ดูแลคนไข้หลักทั้งหมด <strong>{myPatients.length} ท่าน</strong> • มอบสิทธิ์ให้นักกายภาพท่านอื่นดูแลแทนชั่วคราว
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsDelegationModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-900/30 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>+ ฝากเคสชั่วคราว (Assign Temporary Coverage)</span>
          </button>
        </div>

        {/* Active Delegations Table if any */}
        {transfers.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>รายการฝากเคสชั่วคราวที่กำลังมีผล (Active Delegations)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {transfers.map((t) => (
                <div
                  key={t.id}
                  className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{t.patient?.first_name || 'คนไข้'} {t.patient?.last_name || ''}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        Covering / รับฝากเคส
                      </span>
                    </div>
                    <div className="text-slate-400 mt-1">
                      ผู้รับฝาก: <strong className="text-teal-300">{activePtList.find((p: PtRecord) => p.user_id === t.to_pt_id)?.profile?.full_name || 'นักกายภาพ'}</strong>
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      ช่วงวันที่: {t.start_date} ถึง {t.end_date} • หมายเหตุ: {t.notes || '-'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancelDelegation(t.id)}
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition text-xs font-semibold cursor-pointer shrink-0"
                    title="ยกเลิกการฝากเคส"
                  >
                    ยกเลิก
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Patients In Care Table */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            รายชื่อคนไข้ในความรับผิดชอบหลัก ({myPatients.length} ท่าน)
          </h4>

          {myPatients.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800">
              ยังไม่มีคนไข้ในความรับผิดชอบหลัก
            </div>
          ) : (
            <div className="space-y-2">
              {myPatients.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 text-teal-400 font-bold flex items-center justify-center shrink-0">
                      {p.first_name[0] || 'P'}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">
                        {p.first_name} {p.last_name}
                      </div>
                      <div className="text-slate-400 text-xs">
                        HN: <span className="font-mono text-cyan-400">{p.hn}</span> • {p.injury || 'ไม่ได้ระบุอาการ'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateToTab?.('schedule', p.id)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      <span>จัดตารางนัด</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToTab?.('records', p.id)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <ClipboardList className="w-3.5 h-3.5 text-cyan-400" />
                      <span>เวชระเบียน</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Temporary Case Delegation (ฝากเคสชั่วคราว) */}
      {isDelegationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border-2 border-emerald-500/40 rounded-3xl p-6 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-400" />
                  <span>ฝากเคสชั่วคราว (Assign Temporary Coverage)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  มอบหมายสิทธิ์ให้นักกายภาพผู้รับฝากดูแลและปรับตารางฝึกในช่วงเวลาที่ระบุ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDelegationModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDelegation} className="space-y-4">
              {/* 1. เลือกคนไข้ */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  1. เลือกคนไข้ในความดูแล
                </label>
                <select
                  required
                  value={delegationFormData.patient_id}
                  onChange={(e) =>
                    setDelegationFormData({
                      ...delegationFormData,
                      patient_id: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {myPatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.hn})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. เลือกนักกายภาพผู้รับฝาก */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  2. เลือกนักกายภาพผู้รับฝาก (Covering PT)
                </label>
                <select
                  required
                  value={delegationFormData.covering_pt_id}
                  onChange={(e) =>
                    setDelegationFormData({
                      ...delegationFormData,
                      covering_pt_id: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {activePtList.map((pt) => (
                    <option key={pt.user_id} value={pt.user_id}>
                      {pt.profile?.full_name || 'นักกายภาพ'} (@{pt.profile?.username}) • {pt.specialty || 'ทั่วไป'}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. ช่วงวันที่ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    วันที่เริ่มฝากเคส
                  </label>
                  <input
                    type="date"
                    required
                    value={delegationFormData.start_date}
                    onChange={(e) =>
                      setDelegationFormData({
                        ...delegationFormData,
                        start_date: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    วันที่สิ้นสุดการฝากเคส
                  </label>
                  <input
                    type="date"
                    required
                    value={delegationFormData.end_date}
                    onChange={(e) =>
                      setDelegationFormData({
                        ...delegationFormData,
                        end_date: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* 4. เหตุผล / หมายเหตุ */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  เหตุผล / หมายเหตุ (Default: &quot;-&quot;)
                </label>
                <input
                  type="text"
                  value={delegationFormData.notes}
                  onChange={(e) =>
                    setDelegationFormData({
                      ...delegationFormData,
                      notes: e.target.value,
                    })
                  }
                  placeholder="เช่น ติดภารกิจอบรมทางวิชาการ, ลาพักร้อน"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDelegationModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-900/40 cursor-pointer"
                >
                  {loading ? 'กำลังบันทึก...' : 'บันทึกการฝากเคส'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
