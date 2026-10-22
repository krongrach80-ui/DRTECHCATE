'use client';

import React, { useState } from 'react';
import { Phone, Delete, CheckCircle2, AlertCircle, X, ScanFace } from 'lucide-react';

interface KioskPhoneKeypadProps {
  deviceToken?: string;
  onSuccess: (patient: { id: string; full_name: string; username: string }, queueToken: string) => void;
  onSwitchToFace: () => void;
  onCancel: () => void;
}

export default function KioskPhoneKeypad({
  deviceToken,
  onSuccess,
  onSwitchToFace,
  onCancel,
}: KioskPhoneKeypadProps) {
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDigit = (digit: string) => {
    if (inputVal.length >= 15) return;
    setInputVal((prev) => prev + digit);
    setErrorMsg(null);
  };

  const handleDelete = () => {
    setInputVal((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setInputVal('');
    setErrorMsg(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputVal.trim().length < 3) {
      setErrorMsg('กรุณากรอกเบอร์โทรศัพท์หรือ HN อย่างน้อย 3 ตัวอักษร');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/kiosk/check-in/phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kiosk-token': deviceToken || process.env.NEXT_PUBLIC_DEFAULT_KIOSK_TOKEN || 'demo-kiosk-token',
        },
        body: JSON.stringify({
          phone_or_hn: inputVal.trim(),
          device_token: deviceToken || 'demo-kiosk-token',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'ไม่พบข้อมูลผู้ป่วยในระบบ');
      }

      onSuccess(data.patient, data.queue_token);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการตรวจสอบ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-[620px] max-w-md mx-auto w-full p-6 text-white select-none">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Phone className="w-4 h-4" />
          <span>เช็คอินด้วยเบอร์โทรศัพท์ / รหัสประจำตัว (HN)</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">กรุณากรอกเบอร์โทรศัพท์ของท่าน</h2>
        <p className="text-xs text-slate-400">ใช้สำหรับผู้ป่วยที่ยังไม่ได้ลงทะเบียนใบหน้า หรือสแกนไม่สำเร็จ</p>
      </div>

      {/* Input Display */}
      <div className="w-full my-4">
        <div className="w-full py-4 px-6 bg-slate-900 border-2 border-slate-700 focus-within:border-emerald-500 rounded-2xl text-center shadow-inner">
          <div className="text-3xl font-mono font-bold tracking-widest text-emerald-400 min-h-[44px] flex items-center justify-center">
            {inputVal || <span className="text-slate-600 tracking-normal text-xl font-sans">แตะแป้นพิมพ์ด้านล่าง</span>}
          </div>
        </div>

        {errorMsg && (
          <div className="mt-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Large Touch Numeric Keypad (4x3 Grid) */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            className="h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 active:border-emerald-500/50 text-2xl font-bold text-white shadow-md active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          onClick={handleClear}
          className="h-16 rounded-2xl bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-sm font-semibold active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          ล้าง (C)
        </button>

        <button
          type="button"
          onClick={() => handleDigit('0')}
          className="h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 active:border-emerald-500/50 text-2xl font-bold text-white shadow-md active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          0
        </button>

        <button
          type="button"
          onClick={handleDelete}
          className="h-16 rounded-2xl bg-slate-900/60 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-800 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          title="ลบตัวเลขล่าสุด"
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>

      {/* Submit Button */}
      <button
        type="button"
        onClick={() => handleSubmit()}
        disabled={loading || inputVal.length < 3}
        className="w-full max-w-sm py-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 text-slate-950 font-extrabold text-base rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <CheckCircle2 className="w-5 h-5" />
        <span>{loading ? 'กำลังตรวจสอบ...' : 'ยืนยันรับคิวบริการ'}</span>
      </button>

      {/* Navigation Options */}
      <div className="flex items-center justify-between w-full max-w-sm pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>ยกเลิก</span>
        </button>

        <button
          type="button"
          onClick={onSwitchToFace}
          className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 px-3 py-2 rounded-lg hover:bg-sky-500/10 transition-colors cursor-pointer"
        >
          <ScanFace className="w-4 h-4" />
          <span>สลับไปสแกนใบหน้า</span>
        </button>
      </div>
    </div>
  );
}
