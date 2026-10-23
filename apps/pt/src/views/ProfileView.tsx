import React, { useState } from 'react';
import {
  UserCheck,
  Award,
  FileBadge,
  AlertTriangle,
  CheckCircle2,
  X,
  Save,
  Camera
} from 'lucide-react';
import {
  UserProfile,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';

interface ProfileViewProps {
  currentUser: UserProfile;
  onProfileUpdated: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  onProfileUpdated,
}) => {
  const [formData, setFormData] = useState({
    full_name: currentUser.full_name || '',
    phone: currentUser.phone || '',
    bio: currentUser.bio || '',
    specialty: currentUser.pt_details?.specialty || '',
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  return (
    <div className="p-8 max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <UserCheck className="w-6 h-6 text-teal-400" />
          <span>ข้อมูลส่วนตัว & ใบประกอบวิชาชีพ (My Profile)</span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          จัดการข้อมูลการติดต่อ ความเชี่ยวชาญ และตรวจสอบสถานะใบอนุญาตประกอบวิชาชีพกายภาพบำบัด
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

      {/* Main Profile Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8 shadow-xl">
        {/* Top: Avatar & Identity Header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-8 border-b border-slate-800">
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-teal-500/20 overflow-hidden border border-teal-400/30">
              {currentUser.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
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
                  เลขที่ใบประกอบวิชาชีพ: {currentUser.pt_details?.license_no || 'ไม่ระบุ'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                <Award className="w-4 h-4 text-cyan-400" />
                <span>ความเชี่ยวชาญ: {currentUser.pt_details?.specialty || 'กายภาพบำบัดทั่วไป'}</span>
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
              ความเชี่ยวชาญทางกายภาพบำบัด
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
              rows={4}
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="ข้อมูลแนะนำตัว ความเชี่ยวชาญเฉพาะทาง หรือเวลาปฏิบัติงาน..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
