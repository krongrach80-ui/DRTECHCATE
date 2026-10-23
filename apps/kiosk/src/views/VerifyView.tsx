import React, { useState, useEffect } from 'react';
import { MirrorCanvas } from '../components/MirrorCanvas';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { AlertCircle, Bell } from 'lucide-react';

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
  onSuccess: _onSuccess,
  onFailure,
  onCallStaff,
}) => {
  const [progress, setProgress] = useState<number>(0);
  const [nonce, setNonce] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('กรุณามองตรงที่กล้อง อยู่นิ่งๆ สักครู่');
  const [challengeError, setChallengeError] = useState<string | null>(null);

  // Request challenge from API (Fail closed: No test fallback nonce)
  useEffect(() => {
    let isMounted = true;
    async function getChallenge() {
      try {
        const res = await defaultApiClient.kiosk.requestChallenge(kioskId);
        if (res && res.nonce && isMounted) {
          setNonce(res.nonce);
        } else if (isMounted) {
          setChallengeError('ไม่สามารถขอ Challenge จากเซิร์ฟเวอร์ได้');
          setStatusText('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อยืนยันตัวตนได้';
          setChallengeError(msg);
          setStatusText('เซิร์ฟเวอร์ไม่พร้อมใช้งาน (503)');
          onFailure?.('ระบบยืนยันตัวตนไม่พร้อมใช้งาน');
        }
      }
    }
    getChallenge();
    return () => {
      isMounted = false;
    };
  }, [kioskId, onFailure]);

  // Biometric scanning ring progression when active
  useEffect(() => {
    if (!nonce || challengeError) return;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev < 10) return prev + 1;
        return 10;
      });
    }, 250);

    return () => clearInterval(timer);
  }, [nonce, challengeError]);

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

        {(errorMessage || challengeError) && (
          <div className="mt-2 text-rose-400 text-xs font-medium">
            {challengeError || errorMessage}
          </div>
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

      {/* Help & SOS Call Button Only (All Mock Buttons Removed) */}
      <div className="w-full max-w-xl flex flex-col items-center gap-4">
        <div className="flex items-center justify-between w-full pt-4 border-t border-slate-800/80 text-xs text-slate-500">
          <span>ความท้าทาย (Nonce): {nonce ? nonce.slice(0, 12) + '...' : 'กำลังเชื่อมต่อ...'}</span>
          <button
            type="button"
            onClick={onCallStaff}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:text-rose-300 font-medium transition"
          >
            <Bell className="w-4 h-4 text-rose-400" />
            <span>สแกนไม่ได้? กดเรียกเจ้าหน้าที่</span>
          </button>
        </div>
      </div>
    </div>
  );
};
