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
      <div className="min-h-screen bg-gradient-to-br from-[#F0FDF9] via-[#FFFFFF] to-[#EFF6FF] flex items-center justify-center text-[#063932]">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin mx-auto" />
          <div className="text-sm font-semibold text-emerald-900">กำลังตรวจสอบสิทธิ์ผู้อำนวยการโรงพยาบาล...</div>
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

  // Master Prompt v5: Clinical Emerald Shell 100% Default Presentation
  return (
    <div className="relative w-screen h-screen">
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

};

export const App = AdminApp;
