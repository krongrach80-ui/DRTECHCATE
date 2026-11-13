import React, { useRef, useCallback } from 'react';
import { MirrorCanvas } from '../components/MirrorCanvas';
import { ArrowRight, User } from 'lucide-react';

interface PresentViewProps {
  onContinue: () => void;
  lang?: 'th' | 'en' | 'cn';
}

const I18N = {
  th: {
    welcomePrefix: 'สวัสดีครับ ยินดีต้อนรับสู่',
    subtitle: 'ระบบพร้อมให้บริการกายภาพบำบัดประจำวันของท่านแล้ว',
    guidance: 'ตรวจพบผู้ใช้งาน • กรุณามองตรง',
    continueBtn: 'เข้าสู่การยืนยันตัวตน',
  },
  en: {
    welcomePrefix: 'Welcome to',
    subtitle: 'Your daily physical therapy system is ready.',
    guidance: 'User detected • Please look straight ahead',
    continueBtn: 'Proceed to Verification',
  },
  cn: {
    welcomePrefix: '您好，欢迎使用',
    subtitle: '您的日常康复训练系统已准备就绪',
    guidance: '检测到用户 • 请正视前方',
    continueBtn: '进入身份验证',
  },
} as const;

export const PresentView: React.FC<PresentViewProps> = ({ onContinue, lang = 'th' }) => {
  const t = I18N[lang] || I18N.th;
  const hasClickedRef = useRef<boolean>(false);

  const handleContinue = useCallback(() => {
    if (hasClickedRef.current) return;
    hasClickedRef.current = true;
    onContinue();
  }, [onContinue]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950">
      {/* Top Greeting Banner */}
      <div className="text-center animate-fade-in">
        <h2 className="text-3xl font-extrabold text-white">
          {t.welcomePrefix} <span className="text-blue-400">DrTech.Care</span>
        </h2>
        <p className="text-base text-slate-400 mt-1">{t.subtitle}</p>
      </div>

      {/* Mirrored Camera View with Head Silhouette */}
      <div className="my-auto w-full max-w-xl h-96">
        <MirrorCanvas
          showRing={true}
          ringProgress={5}
          guidanceText={t.guidance}
          className="w-full h-full"
        />
      </div>

      {/* Continue Action */}
      <div className="w-full max-w-md pb-4">
        <button
          type="button"
          onClick={handleContinue}
          className="touch-btn w-full py-5 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xl shadow-xl shadow-blue-600/30 flex items-center justify-center gap-3"
        >
          <User className="w-6 h-6" />
          <span>{t.continueBtn}</span>
          <ArrowRight className="w-6 h-6 ml-1" />
        </button>
      </div>
    </div>
  );
};
