/**
 * apps/admin/src/smart-portal/SmartExerciseLibraryModal.tsx
 * Custom Exercise Creation & Media Upload (Master Prompt v4 Section 5)
 */

import React, { useState } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  X,
  Upload,
  CheckCircle2,
  RefreshCw,
  Activity,
} from 'lucide-react';

interface SmartExerciseLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SmartExerciseLibraryModal: React.FC<SmartExerciseLibraryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [targetJoint, setTargetJoint] = useState('ไหล่ (Shoulder)');
  const [targetAngle, setTargetAngle] = useState(90);
  const [safetyPrecaution, setSafetyPrecaution] = useState('');
  const [demoFileBase64, setDemoFileBase64] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setDemoFileBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('กรุณากรอกชื่อท่าฝึก');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await defaultApiClient.exercises.create({
        title: name.trim(),
        target_joint: targetJoint,
        warnings: safetyPrecaution.trim() || undefined,
        image_path: demoFileBase64 || undefined,
        default_sets: 3,
        default_reps: 10,
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกท่าฝึกได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">เพิ่มท่าฝึกกายภาพใหม่</h2>
              <div className="text-xs text-slate-400">
                บันทึกลงคลังท่าส่วนกลาง & public/uploads/exercises/
              </div>
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
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-red-200 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-300">
              ชื่อท่าทางกายภาพ <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น หมุนข้อไหล่ไปข้างหน้า, เหยียดข้อศอกตรง"
              required
              className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none"
            />
          </div>

          {/* Target Joint & Target Angle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-300">
                ข้อต่อเป้าหมาย (Target Joint)
              </label>
              <select
                value={targetJoint}
                onChange={(e) => setTargetJoint(e.target.value)}
                className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none"
              >
                <option value="ไหล่ (Shoulder)">ไหล่ (Shoulder)</option>
                <option value="ข้อศอก (Elbow)">ข้อศอก (Elbow)</option>
                <option value="ข้อมือ (Wrist)">ข้อมือ (Wrist)</option>
                <option value="ข้อเข่า (Knee)">ข้อเข่า (Knee)</option>
                <option value="ข้อสะโพก (Hip)">ข้อสะโพก (Hip)</option>
                <option value="คอและศีรษะ (Neck)">คอและศีรษะ (Neck)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-300">
                มุมองศาเป้าหมาย (องศา)
              </label>
              <input
                type="number"
                min="0"
                max="180"
                value={targetAngle}
                onChange={(e) => setTargetAngle(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none"
              />
            </div>
          </div>

          {/* Safety Precaution */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-300">
              คำเตือนความปลอดภัย (Safety Precaution)
            </label>
            <input
              type="text"
              value={safetyPrecaution}
              onChange={(e) => setSafetyPrecaution(e.target.value)}
              placeholder="เช่น ห้ามยกเกินระดับสายตาหากรู้สึกเจ็บแปลบ"
              className="bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none"
            />
          </div>

          {/* Upload Demo GIF / Image */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-300">
              รูปภาพหรือ GIF สาธิต (Demo Image/GIF)
            </label>
            <div className="border border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-3 flex items-center justify-between gap-3 bg-slate-950">
              <label className="cursor-pointer flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                <Upload className="w-4 h-4" />
                <span>อัปโหลดไฟล์ (JPG/PNG/GIF)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {demoFileBase64 && (
                <span className="text-[11px] text-emerald-300 font-medium">✓ เลือกไฟล์แล้ว</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition active:scale-95 shadow-md shadow-emerald-950 flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>บันทึกท่าฝึก</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
