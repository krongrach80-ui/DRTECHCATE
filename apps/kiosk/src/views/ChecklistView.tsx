import React, { useState, useEffect } from 'react';
import { TodayCoursePlan } from '../../../../packages/mission-engine/src/index.js';
import { Play, Gamepad2, HeartPulse, Clock } from 'lucide-react';

interface ChecklistViewProps {
  plan: TodayCoursePlan;
  onStart: () => void;
}

export const ChecklistView: React.FC<ChecklistViewProps> = ({ plan, onStart }) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onStart();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onStart]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950">
      {/* Title */}
      <div className="text-center max-w-xl">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
          แผนกายภาพบำบัดวันนี้
        </span>
        <h2 className="text-3xl font-extrabold text-white mt-2">
          ยินดีต้อนรับ คุณ{plan.patientFirstName}
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          วันนี้มีโปรแกรมกายภาพ {plan.exercises.length} ท่า
          {plan.includeMinigame ? ' และมินิเกมฝึกประสาทสัมผัส 1 เกม' : ''}
        </p>
      </div>

      {/* Main Checklist Card */}
      <div className="my-auto w-full max-w-2xl flex flex-col gap-3">
        {plan.doctorNotes && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-200 text-sm mb-2">
            <HeartPulse className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">คำแนะนำจากนักกายภาพบำบัด: </span>
              <span>{plan.doctorNotes}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2.5 max-h-[46vh] overflow-y-auto pr-1">
          {plan.exercises.map((ex, index) => (
            <div
              key={ex.id || index}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-lg"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-blue-400 font-mono text-lg">
                  {index + 1}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">{ex.title}</h4>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 font-medium">
                    <span>{ex.target_sets} เซ็ต</span>
                    <span>•</span>
                    <span>เซ็ตละ {ex.target_reps} ครั้ง</span>
                    {ex.target_duration_seconds && (
                      <>
                        <span>•</span>
                        <span>{ex.target_duration_seconds} วินาที</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300 font-medium">
                รอฝึก
              </span>
            </div>
          ))}

          {plan.includeMinigame && (
            <div className="p-5 rounded-2xl bg-purple-950/20 border border-purple-800/40 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Gamepad2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-purple-200">
                    {plan.minigameTitle || 'มินิเกมฝึกความจำและประสาทสัมผัส'}
                  </h4>
                  <p className="text-xs text-purple-300/70 mt-0.5">
                    ประเมินการประสานงานของสายตาและมือ
                  </p>
                </div>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-purple-900/50 text-purple-300 font-medium border border-purple-700/50">
                มินิเกม
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Start Button & Auto-Timer */}
      <div className="w-full max-w-xl flex flex-col items-center gap-2 pb-2">
        <button
          onClick={onStart}
          className="touch-btn w-full py-5 rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xl shadow-2xl shadow-blue-600/40 flex items-center justify-center gap-3"
        >
          <Play className="w-6 h-6 fill-white" />
          <span>เริ่มฝึกกายภาพบำบัดทันที</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          <span>ระบบจะเริ่มอัตโนมัติใน {secondsRemaining} วินาที</span>
        </div>
      </div>
    </div>
  );
};
