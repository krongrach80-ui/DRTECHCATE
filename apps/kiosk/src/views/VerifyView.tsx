import React, { useState, useEffect } from 'react';
import { MirrorCanvas } from '../components/MirrorCanvas';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { AlertCircle, Bell, RefreshCw, CheckCircle2 } from 'lucide-react';

interface VerifyViewProps {
  kioskId?: string;
  failedCount?: number;
  errorMessage?: string | null;
  onSuccess: (patientId: string, firstName: string, avatarUrl?: string | null) => void;
  onFailure: (error?: string) => void;
  onCallStaff: () => void;
}

export const VerifyView: React.FC<VerifyViewProps> = ({
  kioskId = 'kiosk-01',
  failedCount = 0,
  errorMessage,
  onSuccess,
  onFailure,
  onCallStaff,
}) => {
  const [progress, setProgress] = useState<number>(0);
  const [nonce, setNonce] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('กรุณามองตรงที่กล้อง อยู่นิ่งๆ สักครู่');

  // Request challenge from API
  useEffect(() => {
    let isMounted = true;
    async function getChallenge() {
      try {
        const res = await defaultApiClient.kiosk.requestChallenge(kioskId);
        if (res && res.nonce && isMounted) {
          setNonce(res.nonce);
        }
      } catch {
        // Fallback simulated challenge for offline/test mode
        if (isMounted) setNonce('test-nonce-123');
      }
    }
    getChallenge();
    return () => {
      isMounted = false;
    };
  }, [kioskId]);

  // Simulate scanning ring progression
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev < 10) return prev + 1;
        return 10;
      });
    }, 250);

    return () => clearInterval(timer);
  }, []);

  const handleSimulateSuccess = () => {
    setStatusText('ยืนยันตัวตนสำเร็จ!');
    setTimeout(() => {
      onSuccess('patient-001', 'วิชัย', null);
    }, 400);
  };

  const handleSimulateFailure = () => {
    onFailure('ใบหน้าไม่ตรงกับข้อมูลในระบบ หรือยังไม่ได้เช็คอินวันนี้');
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-between py-8 px-6 select-none bg-slate-950">
      {/* Header instructions */}
      <div className="text-center max-w-xl">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
          ขั้นตอนที่ 2 / 3
        </span>
        <h2 className="text-3xl font-extrabold text-white mt-2">ยืนยันตัวตนด้วยใบหน้า</h2>
        <p className="text-sm text-slate-400 mt-1">
          ระบบเปรียบเทียบใบหน้ากับกลุ่มผู้มีนัดหมายและเช็คอินในวันนี้
        </p>

        {failedCount > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>สแกนไม่สำเร็จครั้งที่ {failedCount} / 3 (หากไม่ผ่าน 3 ครั้งจะเรียกเจ้าหน้าที่อัตโนมัติ)</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-2 text-rose-400 text-xs font-medium">{errorMessage}</div>
        )}
      </div>

      {/* Mirrored Camera View with 10-Tick Progress Arc */}
      <div className="my-auto w-full max-w-xl h-96">
        <MirrorCanvas
          showRing={true}
          ringProgress={progress}
          guidanceText={statusText}
          className="w-full h-full"
        />
      </div>

      {/* Action / Test Controls & Help */}
      <div className="w-full max-w-xl flex flex-col items-center gap-4">
        {/* Fast Action Buttons */}
        <div className="w-full flex items-center gap-3">
          <button
            onClick={handleSimulateSuccess}
            className="touch-btn flex-1 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>ตรวจจับผ่าน (Match Success)</span>
          </button>

          <button
            onClick={handleSimulateFailure}
            className="touch-btn flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-base border border-slate-700 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-5 h-5 text-slate-400" />
            <span>ลองใหม่ / สแกนไม่ผ่าน</span>
          </button>
        </div>

        {/* Emergency SOS Call Button */}
        <div className="flex items-center justify-between w-full pt-2 border-t border-slate-800/80 text-xs text-slate-500">
          <span>ความท้าทาย (Nonce): {nonce ? nonce.slice(0, 12) : 'กำลังเชื่อมต่อ...'}</span>
          <button
            onClick={onCallStaff}
            className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 font-medium"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>สแกนไม่ได้? กดเรียกเจ้าหน้าที่</span>
          </button>
        </div>
      </div>
    </div>
  );
};
