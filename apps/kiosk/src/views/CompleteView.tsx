import React, { useState } from 'react';
import { VasPainScale } from '../components/VasPainScale';
import { Award, CheckCircle, HeartPulse, LogOut } from 'lucide-react';

interface CompleteViewProps {
  doctorNotes?: string | null;
  patientFirstName?: string | null;
  onFinish: (painScore: number, feedback?: string) => void;
}

export const CompleteView: React.FC<CompleteViewProps> = ({
  doctorNotes,
  patientFirstName,
  onFinish,
}) => {
  const [painVAS, setPainVAS] = useState<number>(0);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950 overflow-y-auto">
      {/* Celebration Header */}
      <div className="text-center max-w-xl">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/20 flex items-center justify-center mx-auto mb-3 text-emerald-400">
          <Award className="w-9 h-9" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
          ยินดีด้วยครับ คุณ{patientFirstName || 'ผู้รับบริการ'}!
        </h2>
        <p className="text-base text-emerald-300 font-medium mt-1">
          ท่านได้ฝึกกายภาพบำบัดครบตามโปรแกรมวันนี้เรียบร้อยแล้ว
        </p>
      </div>

      {/* Main Content Card: Doctor advice & VAS Pain Scale */}
      <div className="my-auto w-full max-w-3xl flex flex-col gap-6 py-4">
        {doctorNotes && (
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex items-start gap-4">
            <HeartPulse className="w-6 h-6 text-blue-400 shrink-0 mt-1" />
            <div>
              <h4 className="text-base font-bold text-white">
                คำแนะนำในการฟื้นฟูต่อเนื่องจากนักกายภาพบำบัด:
              </h4>
              <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                {doctorNotes}
              </p>
            </div>
          </div>
        )}

        {/* VAS Pain Scale Card */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
          <div className="mb-4">
            <h4 className="text-lg font-bold text-white">
              ประเมินระดับความปวดหลังฝึก (Pain VAS Score)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              แตะเลือกระดับความรู้สึกปวดของท่านในขณะนี้ (0 = ไม่ปวดเลย, 10 = ปวดมากที่สุด)
            </p>
          </div>

          <VasPainScale value={painVAS} onChange={setPainVAS} />
        </div>
      </div>

      {/* Finish Action */}
      <div className="w-full max-w-xl pb-2">
        <button
          onClick={() => onFinish(painVAS)}
          className="touch-btn w-full py-5 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xl shadow-2xl shadow-blue-600/30 flex items-center justify-center gap-3"
        >
          <CheckCircle className="w-7 h-7" />
          <span>บันทึกและจบการใช้งานตู้</span>
          <LogOut className="w-5 h-5 ml-2 opacity-80" />
        </button>
      </div>
    </div>
  );
};
