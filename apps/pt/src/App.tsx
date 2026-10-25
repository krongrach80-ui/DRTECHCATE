import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  StaffCallRecord,
  defaultApiClient
} from '../../../packages/api-client/src/index.js';
import { ClinicalPtShell } from './clinical-ui/index.js';

export const PtApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [staffCalls, setStaffCalls] = useState<StaffCallRecord[]>([]);

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
        staffCalls={staffCalls}
        onStaffCallHandled={fetchStaffCalls}
        onProfileUpdated={checkSession}
      />
    </div>
  );

};

export const App = PtApp;
