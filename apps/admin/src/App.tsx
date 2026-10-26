import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  defaultApiClient
} from '../../../packages/api-client/src/index.js';
import { ClinicalAdminShell, StaffLoginModal } from './clinical-ui/index.js';

export const AdminApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Check auth session on load
  const checkSession = async () => {
    try {
      setAuthLoading(true);
      const rawUser = await defaultApiClient.auth.me();
      const user = (rawUser && (rawUser as any).user) ? (rawUser as any).user : rawUser;
      const role = (user?.role || '').toLowerCase();
      const uname = (user?.username || '').toLowerCase();
      if (user && (role === 'admin' || role === 'director' || uname === 'director' || uname === 'admin')) {
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
      await defaultApiClient.kiosk.listStaffCalls();
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
        if (event.event === 'staff_call') {
          fetchStaffCalls();
        }
      },
      () => {}
    );

    return () => {
      disconnect();
    };
  }, [currentUser]);

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
    const role = (res.user?.role || res.role || '').toLowerCase();
    const uname = (res.user?.username || credentials.username || '').toLowerCase();
    if (role !== 'admin' && role !== 'director' && uname !== 'director' && uname !== 'admin') {
      throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าถึงส่วนงานผู้อำนวยการโรงพยาบาล (Admin Only)');
    }
    setCurrentUser(res.user);
    await fetchStaffCalls();
  };

  // Enforce authentication: If not authenticated, display login screen exclusively
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F0FDF9] via-[#FFFFFF] to-[#EFF6FF] flex items-center justify-center p-4">
        <StaffLoginModal
          isOpen={true}
          onClose={() => {
            window.location.href = '/';
          }}
          onLogin={handleDirectLogin}
          onReturnToKiosk={() => {
            window.location.href = '/';
          }}
        />
      </div>
    );
  }

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
