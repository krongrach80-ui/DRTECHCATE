import React, { useState, useEffect } from 'react';
import {
  Sidebar
} from './components/Sidebar';
import { StaffView } from './views/StaffView';
import { PatientsView } from './views/PatientsView';
import { PtsView } from './views/PtsView';
import { LibraryView } from './views/LibraryView';
import { ScheduleView } from './views/ScheduleView';
import { SecurityView } from './views/SecurityView';
import { AdminViewTab } from './types';
import {
  UserProfile,
  StaffCallRecord,
  defaultApiClient
} from '../../../packages/api-client/src/index.js';
import { Shield, User, Lock, AlertCircle, Sparkles } from 'lucide-react';
import { ClinicalAdminShell, StaffLoginModal } from './clinical-ui/index.js';

export const AdminApp: React.FC = () => {
  const [shellMode, setShellMode] = useState<'clinical' | 'classic'>('clinical');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<AdminViewTab>('staff');

  // Real-time events state
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [staffCalls, setStaffCalls] = useState<StaffCallRecord[]>([]);

  // Login form state
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Check auth session on load
  const checkSession = async () => {
    try {
      setAuthLoading(true);
      const user = await defaultApiClient.auth.me();
      if (user && user.role === 'admin') {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchStaffCalls = async () => {
    try {
      const calls = await defaultApiClient.kiosk.listStaffCalls();
      setStaffCalls(calls);
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    checkSession();
    fetchStaffCalls();
  }, []);

  // Real-time SSE Connection
  useEffect(() => {
    if (!currentUser) return;

    const disconnect = defaultApiClient.connectEvents(
      (event: { event: string; data: unknown }) => {
        setSseConnected(true);
        if (event.event === 'staff_call') {
          fetchStaffCalls();
        }
      },
      () => {
        setSseConnected(false);
      }
    );

    return () => {
      disconnect();
    };
  }, [currentUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoginLoading(true);
      setLoginError(null);
      const res = await defaultApiClient.auth.login(loginForm);
      if (res.role !== 'admin') {
        setLoginError('บัญชีนี้ไม่มีสิทธิ์เข้าถึงส่วนงานผู้อำนวยการโรงพยาบาล (Admin Only)');
        await defaultApiClient.auth.logout();
        return;
      }
      setCurrentUser(res.user);
      await fetchStaffCalls();
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await defaultApiClient.auth.logout();
    } finally {
      setCurrentUser(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-400 rounded-full animate-spin mx-auto" />
          <div className="text-sm font-medium">กำลังตรวจสอบสิทธิ์ผู้อำนวยการ...</div>
        </div>
      </div>
    );
  }

  const handleDirectLogin = async (credentials: { username: string; password: string }) => {
    const res = await defaultApiClient.auth.login(credentials);
    if (res.role !== 'admin') {
      throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าถึงส่วนงานผู้อำนวยการโรงพยาบาล (Admin Only)');
    }
    setCurrentUser(res.user);
    await fetchStaffCalls();
  };

  // Master Prompt v5: Clinical Emerald Shell Presentation
  if (shellMode === 'clinical') {
    if (!currentUser) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#F0FDF9] via-[#F8FAFC] to-[#EFF6FF] flex items-center justify-center p-4 relative font-sans">
          <div className="absolute top-4 right-4 z-50">
            <button
              type="button"
              onClick={() => setShellMode('classic')}
              className="px-3.5 py-1.5 rounded-full bg-white/90 hover:bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition"
            >
              ⚙️ สลับเป็นโหมดคลาสสิก
            </button>
          </div>

          <StaffLoginModal
            isOpen={true}
            onClose={() => {}}
            onLogin={handleDirectLogin}
            onReturnToKiosk={() => {
              window.location.href = '/';
            }}
          />
        </div>
      );
    }

    return (
      <div className="relative w-screen h-screen">
        <div className="absolute top-4 right-52 z-50">
          <button
            type="button"
            onClick={() => setShellMode('classic')}
            className="px-3 py-1 rounded-full bg-white/90 hover:bg-white border border-slate-200 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur transition"
          >
            ⚙️ โหมดคลาสสิก
          </button>
        </div>

        <ClinicalAdminShell
          currentUser={currentUser}
          onLogout={handleLogout}
          onReturnToKiosk={() => {
            window.location.href = '/';
          }}
          onLogin={handleDirectLogin}
        />
      </div>
    );
  }

  // If not authenticated as Admin, show login screen (Classic)
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative">
        <div className="absolute top-4 right-4 z-50">
          <button
            type="button"
            onClick={() => setShellMode('clinical')}
            className="px-3.5 py-1.5 rounded-full bg-emerald-950 border border-emerald-500/50 text-xs font-bold text-emerald-300 shadow-lg transition flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>🏥 สลับเป็น Clinical Emerald Shell v5</span>
          </button>
        </div>

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <Shield className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-wide">DrTech.Care</h2>
            <p className="text-xs text-teal-400 font-semibold uppercase tracking-wider">
              ผู้อำนวยการโรงพยาบาล (Hospital Director Portal)
            </p>
            <p className="text-xs text-slate-400">
              ระบบกายภาพบำบัดมาตรฐานความปลอดภัยสูงและการสแกนใบหน้า
            </p>
          </div>

          {loginError && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                ชื่อผู้ใช้งาน (Username)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="admin หรือ username"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                รหัสผ่าน (Password)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm rounded-xl transition shadow-lg shadow-teal-950/50 disabled:opacity-50"
            >
              {loginLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบผู้อำนวยการ'}
            </button>
          </form>

          <div className="text-[11px] text-center text-slate-600 border-t border-slate-800/80 pt-4">
            ระบบความปลอดภัย 3 ชั้น • Zero Supabase SDK in Browser
          </div>
        </div>
      </div>
    );
  }

  // Main Admin Dashboard (Classic)
  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans relative">
      <div className="absolute top-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setShellMode('clinical')}
          className="px-3.5 py-1.5 rounded-full bg-emerald-950 border border-emerald-500/50 text-xs font-bold text-emerald-300 shadow-lg transition flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>🏥 สลับเป็น Clinical Emerald Shell v5</span>
        </button>
      </div>

      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        pendingStaffCallsCount={staffCalls.filter((c) => !c.handled_at).length}
        sseConnected={sseConnected}
      />

      <main className="flex-1 overflow-y-auto bg-slate-950 text-slate-200">
        {currentTab === 'staff' && <StaffView />}
        {currentTab === 'patients' && <PatientsView />}
        {currentTab === 'pts' && <PtsView />}
        {currentTab === 'library' && <LibraryView />}
        {currentTab === 'schedule' && <ScheduleView />}
        {currentTab === 'security' && (
          <SecurityView
            staffCalls={staffCalls}
            onStaffCallHandled={fetchStaffCalls}
            sseConnected={sseConnected}
          />
        )}
      </main>
    </div>
  );
};

export const App = AdminApp;
