/**
 * apps/admin/src/clinical-ui/ClinicalAdminShell.tsx
 * Master Prompt v5 Section 4: Master Presentation Shell for Hospital Clinical Admin
 */

import React, { useState } from 'react';
import {
  ClinicalSidebar,
  ClinicalMenuId,
} from './ClinicalSidebar';
import { ClinicalTopHeader } from './ClinicalTopHeader';
import { StaffLoginModal } from './StaffLoginModal';
import { NewPatientRegistrationModal } from './NewPatientRegistrationModal';
import { ClinicalScheduleView } from './ClinicalScheduleView';
import { PhysiotherapistDirectoryView } from './PhysiotherapistDirectoryView';
import { MiniGameQuestionsView } from './MiniGameQuestionsView';
import { SystemAuditLogView } from './SystemAuditLogView';
import { SystemAiSettingsView } from './SystemAiSettingsView';

// Existing feature views
import { StaffView } from '../views/StaffView';
import { PatientsView } from '../views/PatientsView';

import {
  TopProgressBar,
  hospitalTheme,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import { UserProfile } from '../../../../packages/api-client/src/index.js';

interface ClinicalAdminShellProps {
  currentUser: UserProfile | null;
  onLogout: () => void;
  onReturnToKiosk?: () => void;
  onLogin: (credentials: { username: string; password: string }) => Promise<void>;
}

export const ClinicalAdminShell: React.FC<ClinicalAdminShellProps> = ({
  currentUser,
  onLogout,
  onReturnToKiosk,
  onLogin,
}) => {
  const [activeTab, setActiveTab] = useState<ClinicalMenuId>('schedule');
  const [isPageLoading, setIsPageLoading] = useState(false);

  // Modals state
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Tab change with 60FPS top progress bar transition
  const handleSelectTab = (tab: ClinicalMenuId) => {
    setIsMobileMenuOpen(false);
    if (tab === activeTab) return;
    setIsPageLoading(true);
    setActiveTab(tab);
    setTimeout(() => {
      setIsPageLoading(false);
    }, 240);
  };

  const getPageMeta = (tab: ClinicalMenuId): { title: string; subtitle: string } => {
    switch (tab) {
      case 'users':
        return {
          title: 'จัดการข้อมูลผู้ใช้งานและบุคลากร',
          subtitle: 'User & Staff Management Portal',
        };
      case 'patients':
        return {
          title: 'ทะเบียนประวัติและเวชระเบียนคนไข้',
          subtitle: 'Patient Directory & Electronic Health Records',
        };
      case 'schedule':
        return {
          title: 'ตารางฝึกกายภาพและปฏิทินการฟื้นฟู',
          subtitle: 'Clinical Physical Therapy Schedule Planner',
        };
      case 'pts':
        return {
          title: 'ข้อมูลนักกายภาพบำบัดและการกำกับดูแล',
          subtitle: 'Physiotherapist Directory & Clinical Governance',
        };
      case 'minigames':
        return {
          title: 'คลังโจทย์คำถามมินิเกมฝึกสมอง',
          subtitle: 'Cognitive Rehabilitation Question Bank',
        };
      case 'audit':
        return {
          title: 'ประวัติการใช้งานและบันทึกความปลอดภัย',
          subtitle: 'Tamper-Evident System Audit Trail & Security',
        };
      case 'settings':
        return {
          title: 'ตั้งค่าระบบและการประมวลผล AI ชีวมิติ',
          subtitle: 'System & Medical AI Calibration Settings',
        };
    }
  };

  const pageMeta = getPageMeta(activeTab);

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans select-none relative">
      {/* 3px Top Navigation Progress Bar */}
      <TopProgressBar isLoading={isPageLoading} />

      {/* Mobile Slide-Out Drawer (Only on small screens when toggled) */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 md:hidden animate-fade-in flex"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] h-full shadow-2xl flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <ClinicalSidebar
              activeTab={activeTab}
              onSelectTab={handleSelectTab}
              queueBadgeCount={12}
              onLogout={onLogout}
              onReturnToKiosk={onReturnToKiosk}
            />
          </div>
        </div>
      )}

      {/* Desktop Fixed Left Sidebar (Hidden on mobile) */}
      <div className="hidden md:flex shrink-0">
        <ClinicalSidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          queueBadgeCount={12}
          onLogout={onLogout}
          onReturnToKiosk={onReturnToKiosk}
        />
      </div>

      {/* Right Main Body Layout */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Clean White Top Header Bar */}
        <ClinicalTopHeader
          title={pageMeta.title}
          subtitleEn={pageMeta.subtitle}
          userName={currentUser?.full_name || 'นพ. วรชัย อมรเวช'}
          userRoleTitle={currentUser?.role === 'admin' ? 'ผู้อำนวยการโรงพยาบาล (Hospital Director)' : 'นักกายภาพบำบัด (PT)'}
          onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
          onFastCheckIn={() => {
            setActiveTab('schedule');
          }}
          onLogout={onLogout}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Sterile Mint-White Main Workspace */}
        <main
          style={{
            background: hospitalTheme.colors.workspaceBg,
          }}
          className="flex-1 overflow-y-auto"
        >
          {activeTab === 'users' && <StaffView />}
          {activeTab === 'patients' && <PatientsView />}
          {activeTab === 'schedule' && (
            <ClinicalScheduleView />
          )}
          {activeTab === 'pts' && <PhysiotherapistDirectoryView />}
          {activeTab === 'minigames' && <MiniGameQuestionsView />}
          {activeTab === 'audit' && <SystemAuditLogView />}
          {activeTab === 'settings' && <SystemAiSettingsView />}
        </main>
      </div>

      {/* Staff Login Modal */}
      <StaffLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLogin={onLogin}
        onReturnToKiosk={onReturnToKiosk}
      />

      {/* 3-Step New Patient Registration Modal */}
      <NewPatientRegistrationModal
        isOpen={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onSuccess={(_newPatientId) => {
          setActiveTab('patients');
        }}
      />
    </div>
  );
};
