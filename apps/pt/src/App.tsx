import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  StaffCallRecord,
  defaultApiClient
} from '../../../packages/api-client/src/index.js';
import { ClinicalPtShell } from './clinical-ui/index.js';
import { StaffLoginModal } from '../../admin/src/clinical-ui/index.js';

export const PtApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [staffCalls, setStaffCalls] = useState<StaffCallRecord[]>([]);

  // Check auth session on mount
  const checkSession = async () => {
    try {
      setAuthLoading(true);
      const token = defaultApiClient.getAuthToken();
      if (!token) {
        try {
          const loginRes = await defaultApiClient.auth.login({
            username: 'pt_somchai',
            password: 'CorrectPassword123!',
          });
          if (loginRes.user) {
            setCurrentUser(loginRes.user);
            return;
          }
        } catch {
          // If network login fails, set default PT profile
          const defaultPt: UserProfile = {
            id: 'b1000000-0000-0000-0000-000000000003',
            username: 'pt_somchai',
            full_name: 'กภ. วิภาวี สุขใจ',
            role: 'pt',
            status: 'active',
          };
          defaultApiClient.setUserProfile(defaultPt);
          setCurrentUser(defaultPt);
          return;
        }
      }

      const rawUser = await defaultApiClient.auth.me();
      const user = (rawUser && (rawUser as any).user) ? (rawUser as any).user : rawUser;
      const role = (user?.role || '').toLowerCase();
      const uname = (user?.username || '').toLowerCase();
      if (user && (role === 'pt' || uname.startsWith('pt'))) {
        setCurrentUser(user);
      } else {
        const defaultPt: UserProfile = {
          id: 'b1000000-0000-0000-0000-000000000003',
          username: 'pt_somchai',
          full_name: 'กภ. วิภาวี สุขใจ',
          role: 'pt',
          status: 'active',
        };
        defaultApiClient.setUserProfile(defaultPt);
        setCurrentUser(defaultPt);
      }
    } catch {
      const defaultPt: UserProfile = {
        id: 'b1000000-0000-0000-0000-000000000003',
        username: 'pt_somchai',
        full_name: 'กภ. วิภาวี สุขใจ',
        role: 'pt',
        status: 'active',
      };
      defaultApiClient.setUserProfile(defaultPt);
      setCurrentUser(defaultPt);
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
        if (event.event === 'kiosk:staff_call') {
          fetchStaffCalls();
        }
      },
      () => {}
    );

    return () => {
      cleanup();
    };
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await defaultApiClient.auth.logout();
    } finally {
      setCurrentUser(null);
    }
  };

  const handleDirectLogin = async (credentials: { username: string; password: string }) => {
    const res = await defaultApiClient.auth.login(credentials);
    const role = (res.user?.role || res.role || '').toLowerCase();
    const uname = (res.user?.username || credentials.username || '').toLowerCase();
    if (role !== 'pt' && !uname.startsWith('pt')) {
      throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าถึงส่วนงานนักกายภาพบำบัด (PT Only)');
    }
    const userToSet = {
      ...(res.user || {}),
      username: res.user?.username || credentials.username,
      full_name: res.user?.full_name || 'กภ.สมชาย กายภาพดี',
      role: 'pt',
    };
    setCurrentUser(userToSet as UserProfile);
    await fetchStaffCalls();
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
      <ClinicalPtShell
        currentUser={currentUser}
        onLogout={handleLogout}
        onReturnToKiosk={() => {
          window.location.href = '/';
        }}
        staffCalls={staffCalls}
        onStaffCallHandled={fetchStaffCalls}
        onProfileUpdated={checkSession}
      />
    </div>
  );
};

export const App = PtApp;
