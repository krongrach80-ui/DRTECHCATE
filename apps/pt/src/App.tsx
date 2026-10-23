import React, { useState, useEffect } from 'react';
import { PtViewTab } from './types';
import { PtSidebar } from './components/Sidebar';
import { ReceptionView } from './views/ReceptionView';
import { MyPatientsView } from './views/MyPatientsView';
import { ClinicalRecordsView } from './views/ClinicalRecordsView';
import { ExerciseCatalogView } from './views/ExerciseCatalogView';
import { PtScheduleView } from './views/PtScheduleView';
import { ProfileView } from './views/ProfileView';
import {
  UserProfile,
  StaffCallRecord,
  PatientRecord,
  defaultApiClient
} from '../../../packages/api-client/src/index.js';
import { Sparkles, User, Lock, AlertCircle } from 'lucide-react';

export const PtApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<PtViewTab>('reception');

  // Real-time events state
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [staffCalls, setStaffCalls] = useState<StaffCallRecord[]>([]);

  // Inter-view navigation state
  const [activeRecordsPatientId, setActiveRecordsPatientId] = useState<string | undefined>(undefined);

  // Login form state
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Check auth session on mount
  const checkSession = async () => {
    try {
      setAuthLoading(true);
      const user = await defaultApiClient.auth.me();
      if (user && user.role === 'pt') {
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

  useEffect(() => {
    checkSession();
  }, []);

  // Fetch initial staff calls
  const fetchStaffCalls = async () => {
    try {
      const calls = await defaultApiClient.kiosk.listStaffCalls();
      setStaffCalls(calls);
    } catch {
      // offline or no permissions
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchStaffCalls();
    }
  }, [currentUser]);

  // Connect SSE stream for real-time live events
  useEffect(() => {
    if (!currentUser) return;

    const cleanup = defaultApiClient.connectEvents(
      (event) => {
        setSseConnected(true);
        if (event.event === 'kiosk:staff_call') {
          fetchStaffCalls();
        }
      },
      () => {
        setSseConnected(false);
      }
    );

    return () => {
      cleanup();
    };
  }, [currentUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.username.trim() || !loginForm.password) {
      setLoginError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }

    try {
      setLoginLoading(true);
      setLoginError(null);
      const res = await defaultApiClient.auth.login({
        username: loginForm.username.trim(),
        password: loginForm.password,
      });
      if (res.user.role !== 'pt') {
        setLoginError('พอร์ทัลนี้สำหรับนักกายภาพบำบัด (PT) เท่านั้น');
        await defaultApiClient.auth.logout();
        return;
      }
      setCurrentUser(res.user);
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleOpenRecordsForPatient = (p: PatientRecord) => {
    setActiveRecordsPatientId(p.id);
    setCurrentTab('records');
  };

  // Loading Splash Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-400 animate-spin flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm font-medium tracking-wide">กำลังเข้าสู่ระบบ DrTech.Care (PT Portal)...</p>
      </div>
    );
  }

  // PT Login Screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-400 mx-auto flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">DrTech.Care</h1>
            <p className="text-xs text-teal-400 font-semibold uppercase tracking-wider">
              เว็บนักกายภาพบำบัด (Physical Therapist Portal)
            </p>
            <p className="text-xs text-slate-400">
              เข้าสู่ระบบเพื่อจัดการคนไข้, เวชระเบียน, คลังท่า และคิวประจำวัน
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                ชื่อผู้ใช้ (Username)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder="pt_username"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                รหัสผ่าน (Password)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-teal-500/25 transition disabled:opacity-50"
            >
              {loginLoading ? 'กำลังตรวจสอบสิทธิ์...' : 'เข้าสู่ระบบนักกายภาพบำบัด'}
            </button>
          </form>

          <div className="pt-2 text-center text-[11px] text-slate-500">
            ระบบความปลอดภัยโรงพยาบาล • รองรับ HttpOnly Session Cookie • Zero-PII Log
          </div>
        </div>
      </div>
    );
  }

  const unhandledCallsCount = staffCalls.filter((c) => !c.handled_at).length;

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans">
      {/* PT Sidebar Navigation */}
      <PtSidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        currentUser={currentUser}
        staffCallCount={unhandledCallsCount}
        sseConnected={sseConnected}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-950 text-slate-200">
        {currentTab === 'reception' && (
          <ReceptionView
            staffCalls={staffCalls}
            onStaffCallHandled={fetchStaffCalls}
            currentUserId={currentUser.id}
          />
        )}
        {currentTab === 'patients' && (
          <MyPatientsView
            currentUserId={currentUser.id}
            onOpenRecords={handleOpenRecordsForPatient}
          />
        )}
        {currentTab === 'records' && (
          <ClinicalRecordsView initialPatientId={activeRecordsPatientId} />
        )}
        {currentTab === 'exercises' && (
          <ExerciseCatalogView currentUserId={currentUser.id} />
        )}
        {currentTab === 'schedule' && (
          <PtScheduleView currentUserId={currentUser.id} />
        )}
        {currentTab === 'profile' && (
          <ProfileView currentUser={currentUser} onProfileUpdated={checkSession} />
        )}
      </main>
    </div>
  );
};

export const App = PtApp;
