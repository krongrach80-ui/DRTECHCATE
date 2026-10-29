/**
 * apps/kiosk/src/components/UnconfiguredExerciseFallbackModal.tsx
 *
 * UNCONFIGURED EXERCISE FALLBACK MODAL
 * Only shown when an exercise in the database strictly lacks a detection_config.
 * Clearly records 'skipped_unverified' if the patient completes it manually without AI.
 */

import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface UnconfiguredExerciseFallbackModalProps {
  exercise: {
    id?: string;
    exercise_id?: string;
    name?: string;
    exercise_name?: string;
    title?: string;
  };
  onSkipUnverified: () => void;
  onClose: () => void;
}

export const UnconfiguredExerciseFallbackModal: React.FC<UnconfiguredExerciseFallbackModalProps> = ({
  exercise,
  onSkipUnverified,
  onClose,
}) => {
  const name =
    exercise.name ||
    exercise.exercise_name ||
    exercise.title ||
    'ท่ากายภาพบำบัด';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-amber-500/50 shadow-2xl p-6 text-center animate-scale-up">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4 text-2xl text-amber-400">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <h3 className="text-xl font-bold text-white">
          ยังไม่ได้เพิ่มระบบดีเทคกายภาพ โปรดรอการพัฒนา
        </h3>

        <p className="text-xs text-slate-300 mt-2 leading-relaxed">
          ระบบ AI ตรวจจับข้อต่อและประเมินมุมการเคลื่อนไหวของท่า &quot;{name}&quot; อยู่ระหว่างการพัฒนาโดยทีมวิศวกรชีวการแพทย์
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            id="kiosk-skip-unverified-btn"
            data-testid="kiosk-skip-unverified-btn"
            onClick={onSkipUnverified}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/40 cursor-pointer flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            <span>รับทราบและบันทึกว่าทำเสร็จแล้ว (ทำโดยไม่มีการตรวจจับ)</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
