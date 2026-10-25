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
import { ClinicalPtShell } from './clinical-ui/index.js';

export const PtApp: React.FC = () => {
  const [shellMode, setShellMode] = useState<'clinical' | 'classic'>('clinical');
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

  const handleLogout = async () => {
    try {
      await defaultApiClient.auth.logout();
    } finally {
      setCurrentUser(null);
    }
  };

  // Loading Splash Screen (Hospital Mint-White Theme)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F0FDF9] via-[#FFFFFF] to-[#EFF6FF] flex flex-col items-center justify-center text-[#063932]">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-emerald-900 tracking-wide">กำลังเข้าสู่ระบบนักกายภาพบำบัด DrTech.Care...</p>
      </div>
    );
  }

  // Master Prompt v5: Clinical Emerald Shell 100% Default Presentation
  return (
    <div className="relative w-screen h-screen">
      <ClinicalPtShell
        currentUser={currentUser}
        onLogout={handleLogout}
        onReturnToKiosk={() => {
          window.location.href = '/';
        }}
      />
    </div>
  );

};

export const App = PtApp;
