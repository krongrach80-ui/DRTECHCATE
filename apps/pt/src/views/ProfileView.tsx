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
  const [initialFormData, setInitialFormData] = useState({
    full_name: currentUser.full_name || '',
    phone: currentUser.phone || '',
    bio: currentUser.bio || '',
    specialty: currentUser.specialty || currentUser.pt_details?.specialty || '',
  });

  const [formData, setFormData] = useState(initialFormData);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarCacheBuster, setAvatarCacheBuster] = useState(Date.now());

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync state when currentUser is reloaded from session / database
  useEffect(() => {
    const nextData = {
      full_name: currentUser.full_name || '',
      phone: currentUser.phone || '',
      bio: currentUser.bio || '',
      specialty: currentUser.specialty || currentUser.pt_details?.specialty || '',
    };
    setInitialFormData(nextData);
    setFormData(nextData);
    setAvatarCacheBuster(Date.now());
  }, [currentUser]);

  // Track unsaved form changes (dirty state)
  const isDirty =
    formData.full_name !== initialFormData.full_name ||
    formData.phone !== initialFormData.phone ||
    formData.bio !== initialFormData.bio ||
    formData.specialty !== initialFormData.specialty;

  // Unsaved changes browser warning (Test #7)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'คุณมีข้อมูลส่วนตัวที่แก้ไขแต่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

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
        defaultApiClient.patients.list({ limit: 100 }).catch(() => []),
        defaultApiClient.pts.list().catch(() => []),
        defaultApiClient.caseTransfers.list().catch(() => []),
      ]);

      const safePatients = Array.isArray(allPatients) ? allPatients : [];
      const safePts = Array.isArray(allPts) ? allPts : [];
      const safeTransfers = Array.isArray(allTransfers) ? allTransfers : [];

      const assigned = safePatients.filter(
        (p) => p.responsible_pt_id === currentUser.id
      );
      setMyPatients(assigned);
      setActivePtList(safePts.filter((p) => p.user_id !== currentUser.id));
      setTransfers(safeTransfers);

      if (assigned.length > 0 && !delegationFormData.patient_id) {
        setDelegationFormData((prev) => ({
          ...prev,
          patient_id: assigned[0].id,
        }));
      }
      if (safePts.length > 0 && !delegationFormData.covering_pt_id) {
        const otherPt = safePts.find((p) => p.user_id !== currentUser.id);
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
    setNameError(null);
    setPhoneError(null);
    setErrorMsg(null);
    setSuccessMsg(null);

    // 1. Validation: Name must not be empty
    if (!formData.full_name.trim()) {
      setNameError('กรุณากรอกชื่อ-นามสกุลจริง');
      return;
    }

    // 2. Validation: Phone number must be 10 digits if entered (Test #6)
    const cleanPhone = formData.phone.trim();
    if (cleanPhone && !/^[0-9]{10}$/.test(cleanPhone)) {
      setPhoneError('เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก (เช่น 0812345678)');
      return;
    }

    try {
      setLoading(true);
      await defaultApiClient.staff.update(currentUser.id, {
        full_name: formData.full_name.trim(),
        phone: cleanPhone || undefined,
        bio: formData.bio.trim() || undefined,
        specialty: formData.specialty.trim() || undefined,
      });

      setInitialFormData({
        full_name: formData.full_name.trim(),
        phone: cleanPhone,
        bio: formData.bio.trim(),
        specialty: formData.specialty.trim(),
      });
      setSuccessMsg('บันทึกข้อมูลส่วนตัวเรียบร้อย');
      onProfileUpdated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลส่วนตัวได้');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so user can re-trigger on the same file if needed
    e.target.value = '';

    setAvatarError(null);
    setErrorMsg(null);
    setSuccessMsg(null);

    // 1. File size check: limit to 2 MB (Test #3)
    if (file.size > 2 * 1024 * 1024) {
      const msg = 'ขนาดไฟล์ภาพเกินกำหนด (สูงสุด 2 MB)';
      setErrorMsg(msg);
      setAvatarError(msg);
      return;
    }

    // 2. Magic Bytes validation: check genuine JPEG, PNG, or WebP binary header (Test #2)
    try {
      const buffer = await file.slice(0, 16).arrayBuffer();
      const header = new Uint8Array(buffer);
      let isValidMime = false;

      // JPEG: FF D8 FF
      if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
        isValidMime = true;
      }
      // PNG: 89 50 4E 47
      else if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
        isValidMime = true;
      }
      // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
      else if (
        header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
        header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
      ) {
        isValidMime = true;
      }

      if (!isValidMime) {
        const msg = 'ชนิดไฟล์ไม่ถูกต้อง อนุญาตเฉพาะไฟล์ภาพ JPEG, PNG หรือ WebP เท่านั้น';
        setErrorMsg(msg);
        setAvatarError(msg);
        return;
      }
    } catch {
      setErrorMsg('ไม่สามารถอ่านไฟล์ได้');
      return;
    }

    try {
      setLoading(true);
      const res = await defaultApiClient.staff.uploadAvatar(currentUser.id, file);
      if (res && res.ok !== false) {
        setSuccessMsg('อัปโหลดรูปโปรไฟล์เรียบร้อย');
        setAvatarCacheBuster(Date.now());
        onProfileUpdated();
      } else {
        throw new Error(res?.message || 'การอัปโหลดรูปโปรไฟล์ไม่สำเร็จ');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถอัปโหลดรูปโปรไฟล์ได้';
      setErrorMsg(msg);
      setAvatarError(msg);
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
      <div className="bg-white border border-blue-100 rounded-2xl p-8 space-y-8 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            <span>ส่วนที่ 1: ข้อมูลส่วนตัวของฉัน (My Profile)</span>
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            อัปเดตข้อมูลและเลขใบประกอบวิชาชีพ
          </span>
        </div>

        {/* Top: Avatar & Identity Header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-slate-100">
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-3xl font-bold text-white shadow-md shadow-blue-500/20 overflow-hidden border border-blue-200">
              {currentUser.avatar_url ? (
                <img
                  src={
                    currentUser.avatar_url.startsWith('data:')
                      ? currentUser.avatar_url
                      : `${currentUser.avatar_url}${currentUser.avatar_url.includes('?') ? '&' : '?'}v=${avatarCacheBuster}`
                  }
                  alt={currentUser.full_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span>{currentUser.full_name?.charAt(0) || 'P'}</span>
              )}
            </div>
            <label
              className="absolute bottom-0 right-0 p-2 rounded-xl bg-white text-slate-600 hover:text-blue-700 border border-slate-200 cursor-pointer shadow-md transition"
              title="เปลี่ยนรูปภาพโปรไฟล์"
            >
              <Camera className="w-4 h-4" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                disabled={loading}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-2 text-center sm:text-left flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h3 className="text-xl font-bold text-slate-900">{currentUser.full_name}</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                นักกายภาพบำบัด (Physical Therapist)
              </span>
            </div>
            <div className="text-xs text-slate-500 font-mono">
              ชื่อผู้ใช้ในระบบ: @{currentUser.username}
            </div>
            {avatarError && (
              <p className="text-xs text-rose-600 font-medium">{avatarError}</p>
            )}

            <div className="flex flex-wrap gap-3 pt-2 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                <FileBadge className="w-4 h-4 text-blue-600" />
                <span>
                  เลขที่ใบประกอบวิชาชีพ (Read-Only): <strong className="text-blue-900">{currentUser.pt_details?.license_no || 'ก.ภ. 10842'}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>แผนก (Read-Only): <strong className="text-emerald-900">{currentUser.specialty || currentUser.pt_details?.specialty || 'Musculoskeletal PT'}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleUpdateProfile} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                ชื่อ-นามสกุลจริง <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => {
                  setFormData({ ...formData, full_name: e.target.value });
                  if (nameError) setNameError(null);
                }}
                className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white ${
                  nameError ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-blue-500'
                }`}
              />
              {nameError && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{nameError}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                เบอร์โทรศัพท์ติดต่อ (10 หลัก)
              </label>
              <input
                type="tel"
                maxLength={10}
                placeholder="เช่น 0812345678"
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  if (phoneError) setPhoneError(null);
                }}
                className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white ${
                  phoneError ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-blue-500'
                }`}
              />
              {phoneError && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{phoneError}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              ความเชี่ยวชาญเพิ่มเติม
            </label>
            <input
              type="text"
              value={formData.specialty}
              onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
              placeholder="เช่น กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ, ระบบประสาท, กีฬา"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              คำแนะนำตัว & ประวัติย่อ (Bio)
            </label>
            <textarea
              rows={3}
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="ข้อมูลแนะนำตัว ความเชี่ยวชาญเฉพาะทาง หรือเวลาปฏิบัติงาน..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              {isDirty && (
                <span className="text-xs text-amber-700 font-semibold flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>มีข้อมูลที่ยังไม่ได้บันทึก</span>
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition shadow-md ${
                loading
                  ? 'bg-blue-400 text-white cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950/20 cursor-pointer active:scale-95'
              }`}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{loading ? 'กำลังบันทึก...' : 'บันทึกข้อมูลส่วนตัว'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: ASSIGNED CASES & TEMPORARY CASE DELEGATION (เคสในความดูแล & ฝากเคสชั่วคราว) */}
      <div className="bg-white border border-blue-100 rounded-2xl p-8 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              <span>ส่วนที่ 2: เคสในความดูแล & การฝากเคสชั่วคราว (My Cases & Delegation)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              ดูแลคนไข้หลักทั้งหมด <strong>{myPatients.length} ท่าน</strong> • มอบสิทธิ์ให้นักกายภาพท่านอื่นดูแลแทนชั่วคราว
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsDelegationModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-md shadow-emerald-950/20 cursor-pointer active:scale-95"
          >
            <Share2 className="w-4 h-4" />
            <span>+ ฝากเคสชั่วคราว (Assign Temporary Coverage)</span>
          </button>
        </div>

        {/* Active Delegations Table if any */}
        {transfers.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>รายการฝากเคสชั่วคราวที่กำลังมีผล (Active Delegations)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {transfers.map((t) => (
                <div
                  key={t.id}
                  className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span>{t.patient?.first_name || 'คนไข้'} {t.patient?.last_name || ''}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                        Covering / รับฝากเคส
                      </span>
                    </div>
                    <div className="text-slate-600 mt-1">
                      ผู้รับฝาก: <strong className="text-blue-700">{activePtList.find((p: PtRecord) => p.user_id === t.to_pt_id)?.profile?.full_name || 'นักกายภาพ'}</strong>
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      ช่วงวันที่: {t.start_date} ถึง {t.end_date} • หมายเหตุ: {t.notes || '-'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancelDelegation(t.id)}
                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition text-xs font-semibold cursor-pointer shrink-0"
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
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            รายชื่อคนไข้ในความรับผิดชอบหลัก ({myPatients.length} ท่าน)
          </h4>

          {myPatients.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs bg-slate-50 rounded-2xl border border-slate-200">
              ยังไม่มีคนไข้ในความรับผิดชอบหลัก
            </div>
          ) : (
            <div className="space-y-2">
              {myPatients.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-blue-300 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 border border-blue-200">
                      {p.first_name[0] || 'P'}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">
                        {p.first_name} {p.last_name}
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">
                        HN: <span className="font-mono font-bold text-blue-700">{p.hn}</span> • {p.injury || 'ไม่ได้ระบุอาการ'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateToTab?.('schedule', p.id)}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    >
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      <span>จัดตารางนัด</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToTab?.('records', p.id)}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    >
                      <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-blue-100 rounded-2xl p-6 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-600" />
                  <span>ฝากเคสชั่วคราว (Assign Temporary Coverage)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  มอบหมายสิทธิ์ให้นักกายภาพผู้รับฝากดูแลและปรับตารางฝึกในช่วงเวลาที่ระบุ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDelegationModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDelegation} className="space-y-4">
              {/* 1. เลือกคนไข้ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>
              </div>

              {/* 4. เหตุผล / หมายเหตุ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDelegationModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-sm hover:shadow cursor-pointer"
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
