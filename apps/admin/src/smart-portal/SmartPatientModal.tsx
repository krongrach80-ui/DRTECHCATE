/**
 * apps/admin/src/smart-portal/SmartPatientModal.tsx
 * Option B: Admin/PT PC Patient Information Completion Modal
 * Master Prompt v4 Step 2.3 Option B & Step 2.4
 */

import React, { useState } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';
import {
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface SmartPatientModalProps {
  patient: PatientRecordFile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SmartPatientModal: React.FC<SmartPatientModalProps> = ({
  patient,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [firstName, setFirstName] = useState(patient.first_name || '');
  const [lastName, setLastName] = useState(patient.last_name || '');
  const [age, setAge] = useState(patient.age ? String(patient.age) : '55');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(
    (patient.gender as any) || 'male'
  );
  const [phone, setPhone] = useState(patient.phone || '');
  const [symptoms, setSymptoms] = useState(patient.initial_symptoms || '');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!firstName.trim()) {
      setErrorMsg('กรุณากรอกชื่อผู้ป่วย');
      return;
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum <= 0) {
      setErrorMsg('กรุณากรอกอายุให้ถูกต้อง');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await defaultApiClient.smartOnboarding.completeInfo({
        patient_id: patient.patient_id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        age: ageNum,
        gender,
        phone: phone.trim() || undefined,
        initial_symptoms: symptoms.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-100 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={patient.biometrics.registered_face_url}
                alt="Face Snapshot"
                className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-500 shadow-md bg-slate-950"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="%23f59e0b" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
                }}
              />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-slate-900 flex items-center justify-center text-[10px] text-slate-950 font-bold">
                ✓
              </span>
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-1">
                <span>🟡 บัญชีนี้ลงทะเบียนหน้าแล้ว รอลงข้อมูล</span>
              </div>
              <h2 className="text-lg font-bold text-white">
                กรอกข้อมูลคนไข้ (HN: {patient.hn || patient.patient_id})
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-200 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-300">
                ชื่อ <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="ชื่อจริง"
                required
                className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-300">นามสกุล</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="นามสกุล"
                className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-300">
                อายุ (ปี) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
                className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-300">
                เพศ <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['male', 'female', 'other'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`py-2 rounded-xl text-xs font-medium border transition ${
                      gender === g
                        ? 'bg-emerald-600 border-emerald-500 text-white font-semibold'
                        : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {g === 'male' ? 'ชาย' : g === 'female' ? 'หญิง' : 'อื่นๆ'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-300">เบอร์โทรศัพท์</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08X-XXX-XXXX"
              className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-300">
              อาการเบื้องต้น / แผนการฟื้นฟู
            </label>
            <input
              type="text"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="เช่น อัมพฤกษ์ครึ่งซีก, ข้อไหล่ติด, ผ่าตัดเปลี่ยนข้อเข่า"
              className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition active:scale-95 shadow-md shadow-emerald-950 flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>บันทึกข้อมูลและเปิดใช้งานบัญชี</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
