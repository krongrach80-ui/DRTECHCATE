import React, { useState } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { KeyRound, X, CheckCircle2, AlertCircle } from 'lucide-react';

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (kioskId: string) => void;
  currentKioskId?: string;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentKioskId = 'kiosk-01',
}) => {
  const [kioskId, setKioskId] = useState<string>(currentKioskId);
  const [code, setCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.trim().length < 4) {
      setError('กรุณากรอกรหัสจับคู่ 6 ตัวอักษรให้ครบถ้วน');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await defaultApiClient.kiosk.pair(kioskId.trim(), code.trim().toUpperCase());
      setSuccess(true);
      setTimeout(() => {
        onSuccess(kioskId.trim());
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-8 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 text-blue-400">
          <KeyRound className="w-7 h-7" />
        </div>

        <h3 className="text-2xl font-bold text-white mb-2">จับคู่ตู้บริการ (Terminal Pairing)</h3>
        <p className="text-sm text-slate-400 mb-6">
          กรอกรหัสจับคู่ 6 หลักที่ออกโดยผู้ดูแลระบบ (Director Admin) เพื่อเปิดใช้งานตู้
        </p>

        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center justify-center text-center gap-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
            <span className="text-lg font-bold text-emerald-300">จับคู่ตู้สำเร็จแล้ว!</span>
            <span className="text-xs text-slate-400">กำลังเปิดใช้งานระบบตู้บริการอัตโนมัติ</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">รหัสตู้ (Kiosk ID)</label>
              <input
                type="text"
                value={kioskId}
                onChange={(e) => setKioskId(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white font-mono text-base focus:border-blue-500 focus:outline-none"
                placeholder="เช่น kiosk-01"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                รหัสผ่านครั้งเดียว 6 หลัก (Pairing Code)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                className="w-full px-4 py-4 rounded-2xl bg-slate-950 border border-slate-800 text-white font-mono text-center tracking-widest text-3xl font-bold focus:border-blue-500 focus:outline-none"
                placeholder="XXXXXX"
                required
                autoFocus
              />
              <span className="text-xs text-slate-500 mt-1 block text-center">
                รหัสมีอายุ 10 นาที และใช้ได้ครั้งเดียวเท่านั้น
              </span>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="touch-btn flex-1 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={loading}
                className="touch-btn flex-1 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {loading ? 'กำลังตรวจสอบ...' : 'ยืนยันรหัสจับคู่'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
