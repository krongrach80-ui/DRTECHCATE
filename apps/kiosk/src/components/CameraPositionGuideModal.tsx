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
import { useClinicalI18n } from '../../../../packages/clinical-i18n/src/index';

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
  const { lang } = useClinicalI18n();
  const guide = config.cameraGuide;
  const isPendulum = config.evaluationMode === 'pendulum_circular';

  const viewOrientationLabel: Record<'front' | 'side_45' | 'side_90', Record<string, string>> = {
    front: {
      'th-TH': 'หันหน้าตรงเข้าหากล้อง (Front View)',
      'en-US': 'Face Camera Directly (Front View)',
      'zh-CN': '正对摄像头 (正面视野)',
    },
    side_45: {
      'th-TH': 'ยืนหันข้างเฉียง 45° (Side 45° View)',
      'en-US': 'Stand at 45° Angle (Side 45° View)',
      'zh-CN': '侧向 45° 站立 (斜侧面视野)',
    },
    side_90: {
      'th-TH': 'ยืนหรือนั่งหันข้าง 90° (Side Profile View)',
      'en-US': 'Stand or Sit at 90° (Side Profile View)',
      'zh-CN': '站立或坐姿侧向 90° (侧身全景)',
    },
  };
  const orientationDict = viewOrientationLabel[guide.recommendedView as 'front' | 'side_45' | 'side_90'] || viewOrientationLabel.front;
  const orientationText = orientationDict[lang] || orientationDict['th-TH'];

  const exerciseTitle = lang === 'zh-CN' ? (config.nameCn || config.nameTh) : lang === 'en-US' ? (config.nameEn || config.nameTh) : config.nameTh;
  const instructionText = lang === 'zh-CN' ? (guide.instructionTextCn || guide.instructionTextTh) : lang === 'en-US' ? (guide.instructionTextEn || guide.instructionTextTh) : guide.instructionTextTh;

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
                  {lang === 'zh-CN' ? '摄像头位置指引' : lang === 'en-US' ? 'Camera Positioning Guide' : 'คำแนะนำการจัดตำแหน่งกล้อง'}
                </h2>
                <div className="text-xs text-emerald-400 font-medium">
                  {exerciseTitle}
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
                <div className="text-[11px] text-slate-400">
                  {lang === 'zh-CN' ? '推荐视角' : lang === 'en-US' ? 'Recommended View' : 'มุมมองที่แนะนำ'}
                </div>
                <div className="text-xs font-bold text-white mt-0.5">
                  {orientationText}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
              <Maximize2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">
                  {lang === 'zh-CN' ? '与摄像头距离' : lang === 'en-US' ? 'Distance from Camera' : 'ระยะห่างจากกล้อง'}
                </div>
                <div className="text-xs font-bold text-white mt-0.5">
                  {guide.recommendedDistanceMeters[0]} - {guide.recommendedDistanceMeters[1]} {lang === 'zh-CN' ? '米' : lang === 'en-US' ? 'meters' : 'เมตร'}
                </div>
              </div>
            </div>
          </div>

          {/* Clinical Posture Instruction Box */}
          <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs sm:text-sm leading-relaxed mb-5">
            <div className="font-bold text-emerald-300 mb-1 flex items-center gap-1.5">
              <span>🎯 {lang === 'zh-CN' ? '动作要领与指导:' : lang === 'en-US' ? 'Exercise Guidance:' : 'คำแนะนำสำหรับท่านี้:'}</span>
            </div>
            <p>{instructionText}</p>
          </div>

          {/* Diagram / Checklist */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 mb-6 space-y-2.5 text-xs text-slate-300">
            <div className="font-bold text-slate-200 mb-2">
              ✅ {lang === 'zh-CN' ? '训练注意事项:' : lang === 'en-US' ? 'Safety Checklist:' : 'ข้อควรปฏิบัติ:'}
            </div>
            {isPendulum ? (
              <>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>{lang === 'zh-CN' ? '身体前倾约 20°–45°，让肩膀完全放松下垂' : lang === 'en-US' ? 'Lean torso forward (~20° - 45°) to let the shoulder relax' : 'โน้มลำตัวไปข้างหน้าเล็กน้อย (~20° - 45°) เพื่อให้ข้อไหล่หย่อนลง'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>{lang === 'zh-CN' ? '手臂自然垂直下垂，不要弯曲手肘' : lang === 'en-US' ? 'Let arm hang relaxed and straight, do not bend elbow' : 'ปล่อยแขนให้ห้อยตรงอย่างผ่อนคลาย ไม่เกร็งหรืองอข้อศอก'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>{lang === 'zh-CN' ? '顺应重力缓慢画圆摇摆' : lang === 'en-US' ? 'Gently swing arm in small steady circles with gravity' : 'แกว่งแขนเป็นวงกลมเบาๆ สม่ำเสมอตามแรงโน้มถ่วง'}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>{lang === 'zh-CN' ? '确保摄像头完整捕捉目标关节与躯干' : lang === 'en-US' ? 'Ensure target joints and body frame are fully visible to camera' : 'ตรวจสอบว่ากล้องมองเห็นทั้งข้อต่อและลำตัวครบถ้วน'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>{lang === 'zh-CN' ? '动作轻缓平稳，到达目标绿区后稍作停顿' : lang === 'en-US' ? 'Move slowly and smoothly, holding momentarily in the green zone' : 'ขยับอย่างช้าๆ นุ่มนวล และค้างไว้เมื่อถึงแถบสีเขียว'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span>{lang === 'zh-CN' ? '若有任何疼痛感，请立即点击下方红色按钮停止' : lang === 'en-US' ? 'If you feel pain, stop immediately by tapping the red emergency button below' : 'หากรู้สึกเจ็บ ให้หยุดทันทีโดยกดปุ่มสีแดงด้านล่าง'}</span>
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
            {lang === 'zh-CN' ? '返回' : lang === 'en-US' ? 'Back' : 'ย้อนกลับ'}
          </button>
          <button
            type="button"
            onClick={onReadyToStart}
            className="flex-2 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm sm:text-base shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
          >
            <span>{lang === 'zh-CN' ? '我已准备好，开始 AI 检测' : lang === 'en-US' ? 'I am Ready, Start AI Scan' : 'ฉันพร้อมแล้ว เริ่มตรวจจับท่าฝึก'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
