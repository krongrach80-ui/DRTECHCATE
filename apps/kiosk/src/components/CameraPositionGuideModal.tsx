/**
 * apps/kiosk/src/components/CameraPositionGuideModal.tsx
 *
 * PRE-SESSION CAMERA & POSTURE POSITIONING GUIDE
 * Instructs patients on optimal camera orientation (front vs side 45°/90°)
 * and recommended distance before starting AI joint/pendulum tracking.
 */

import React from 'react';
import { Camera, Compass, Maximize2, ArrowRight, X } from 'lucide-react';
import { ExerciseDetectionConfig } from '../../../../packages/pose-engine/src/types/exerciseConfig';

interface CameraPositionGuideModalProps {
  config: ExerciseDetectionConfig;
  onReadyToStart: () => void;
  onCancel: () => void;
}

export const CameraPositionGuideModal: React.FC<CameraPositionGuideModalProps> = ({
  config,
  onReadyToStart,
  onCancel,
}) => {
  const guide = config.cameraGuide;
  const isPendulum = config.evaluationMode === 'pendulum_circular';

  const viewOrientationLabel: Record<'front' | 'side_45' | 'side_90', string> = {
    front: 'หันหน้าตรงเข้าหากล้อง (Front View)',
    side_45: 'ยืนหันข้างเฉียง 45° (Side 45° View)',
    side_90: 'ยืนหรือนั่งหันข้าง 90° (Side Profile View)',
  };
  const orientationText = viewOrientationLabel[guide.recommendedView as 'front' | 'side_45' | 'side_90'] || 'หันหน้าเข้าหากล้อง';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-xl rounded-3xl bg-slate-900 border-2 border-emerald-500/50 shadow-2xl p-6 sm:p-8 text-white animate-scale-up flex flex-col justify-between max-h-[90vh] overflow-y-auto">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Camera className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  คำแนะนำการจัดตำแหน่งกล้อง
                </h2>
                <div className="text-xs text-emerald-400 font-medium">
                  {config.nameTh}
                </div>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Badges */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
              <Compass className="w-5 h-5 text-teal-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">มุมมองที่แนะนำ</div>
                <div className="text-xs font-bold text-white mt-0.5">
                  {orientationText}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
              <Maximize2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">ระยะห่างจากกล้อง</div>
                <div className="text-xs font-bold text-white mt-0.5">
                  {guide.recommendedDistanceMeters[0]} - {guide.recommendedDistanceMeters[1]} เมตร
                </div>
              </div>
            </div>
          </div>

          {/* Clinical Posture Instruction Box */}
          <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs sm:text-sm leading-relaxed mb-5">
            <div className="font-bold text-emerald-300 mb-1 flex items-center gap-1.5">
              <span>🎯 คำแนะนำสำหรับท่านี้:</span>
            </div>
            <p>{guide.instructionTextTh}</p>
          </div>

          {/* Diagram / Checklist */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 mb-6 space-y-2.5 text-xs text-slate-300">
            <div className="font-bold text-slate-200 mb-2">✅ ข้อควรปฏิบัติ:</div>
            {isPendulum ? (
              <>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>โน้มลำตัวไปข้างหน้าเล็กน้อย (~20° - 45°) เพื่อให้ข้อไหล่หย่อนลง</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>ปล่อยแขนให้ห้อยตรงอย่างผ่อนคลาย ไม่เกร็งหรืองอข้อศอก</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>แกว่งแขนเป็นวงกลมเบาๆ สม่ำเสมอตามแรงโน้มถ่วง</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>ตรวจสอบว่ากล้องมองเห็นทั้งข้อต่อและลำตัวครบถ้วน</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>ขยับอย่างช้าๆ นุ่มนวล และค้างไว้เมื่อถึงแถบสีเขียว</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>หากรู้สึกเจ็บ ให้หยุดทันทีโดยกดปุ่มสีแดงด้านล่าง</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs sm:text-sm transition active:scale-98 cursor-pointer"
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            onClick={onReadyToStart}
            className="flex-2 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm sm:text-base shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
          >
            <span>ฉันพร้อมแล้ว เริ่มตรวจจับท่าฝึก</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
