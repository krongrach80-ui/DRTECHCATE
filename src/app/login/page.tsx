'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, ShieldCheck, Eye, EyeOff, Lock, User, AlertCircle, ArrowRight, ScanFace } from 'lucide-react';
import Link from 'next/link';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorParam = searchParams.get('error');
  const defaultError = errorParam === 'inactive'
    ? 'บัญชีผู้ใช้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
    : errorParam === 'session_expired'
    ? 'เซสชันการใช้งานหมดอายุ หรือถูกบังคับให้ออกจากระบบ กรุณาล็อกอินใหม่'
    : null;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const errorMessage = formError || defaultError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setFormError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }

    setLoading(true);
    setFormError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setFormError(data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        setLoading(false);
        return;
      }

      // Success: redirect to user's authorized role home
      router.push(data.redirect_url || '/');
      router.refresh();
    } catch {
      setFormError('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md glass-panel rounded-2xl p-8 relative z-10">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 mb-4 shadow-inner">
          <Activity className="w-8 h-8 text-sky-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          ระบบกายภาพบำบัดโรงพยาบาล
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          เข้าสู่ระบบสำหรับแพทย์, นักกายภาพบำบัด และผู้ดูแลระบบ
        </p>
      </div>

      {/* Error Notification */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="leading-snug">{errorMessage}</div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            ชื่อผู้ใช้ (Username)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-5 h-5" />
            </div>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="เช่น pt_somchai หรือ admin"
              className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            รหัสผ่าน (Password)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-5 h-5" />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="กรอกรหัสผ่านของคุณ"
              className="w-full pl-11 pr-11 py-3 bg-slate-900/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl glow-btn flex items-center justify-center gap-2 cursor-pointer transition-all mt-6 text-sm"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>กำลังตรวจสอบข้อมูล...</span>
            </>
          ) : (
            <>
              <span>เข้าสู่ระบบ</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Kiosk quick link for patients */}
      <div className="mt-8 pt-6 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-400 mb-3">
          สำหรับคนไข้ที่มาใช้บริการกายภาพบำบัด
        </p>
        <Link
          href="/kiosk"
          className="inline-flex items-center gap-2 text-xs font-medium text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/15 border border-sky-500/20 px-4 py-2.5 rounded-lg transition-all"
        >
          <ScanFace className="w-4 h-4" />
          <span>เช็คอินด้วยใบหน้าที่ตู้ Kiosk</span>
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

      <Suspense fallback={<div className="text-slate-400 text-sm">กำลังโหลด...</div>}>
        <LoginForm />
      </Suspense>

      {/* Security compliance footer */}
      <div className="mt-8 text-center text-xs text-slate-500 flex items-center gap-2 relative z-10">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <span>ระบบความปลอดภัยทางการแพทย์ระดับมาตรฐาน & ข้อมูลชีวมาตรได้รับการคุ้มครองตาม PDPA</span>
      </div>
    </div>
  );
}
