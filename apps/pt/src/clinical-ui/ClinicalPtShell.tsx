/**
 * apps/pt/src/clinical-ui/ClinicalPtShell.tsx
 * Master Prompt v5 Section 4: PT Clinical Emerald Presentation Shell
 */

import React, { useState } from 'react';
import {
  ClinicalSidebar,
  ClinicalMenuId,
  ClinicalTopHeader,
  NewPatientRegistrationModal,
  ClinicalScheduleView,
  PhysiotherapistDirectoryView,
  MiniGameQuestionsView,
  SystemAiSettingsView,
} from '../../../admin/src/clinical-ui/index.js';

import { MyPatientsView } from '../views/MyPatientsView';

import {
  TopProgressBar,
  hospitalTheme,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import { UserProfile } from '../../../../packages/api-client/src/index.js';

interface ClinicalPtShellProps {
  currentUser: UserProfile | null;
  onLogout: () => void;
  onReturnToKiosk?: () => void;
}

export const ClinicalPtShell: React.FC<ClinicalPtShellProps> = ({
  currentUser,
  onLogout,
  onReturnToKiosk,
}) => {
  const [activeTab, setActiveTab] = useState<ClinicalMenuId>('schedule');
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);

  const handleSelectTab = (tab: ClinicalMenuId) => {
    if (tab === activeTab) return;
    setIsPageLoading(true);
    setActiveTab(tab);
    setTimeout(() => {
      setIsPageLoading(false);
    }, 200);
  };

  const getPageMeta = (tab: ClinicalMenuId): { title: string; subtitle: string } => {
    switch (tab) {
      case 'patients':
        return {
          title: 'คนไข้ในความรับผิดชอบและการส่งต่อเคส',
          subtitle: 'Assigned Patients & Clinical Handover',
        };
      case 'schedule':
        return {
          title: 'ตารางฝึกกายภาพและคิวนัดหมายประจำวัน',
          subtitle: 'Physical Therapy Schedule & Daily Queue',
        };
      case 'pts':
        return {
          title: 'รายนามนักกายภาพบำบัดและการฝากเคส',
          subtitle: 'Physiotherapist Team & Case Coverage',
        };
      case 'minigames':
        return {
          title: 'คลังโจทย์มินิเกมฝึกสมองและการฟื้นฟู',
          subtitle: 'Cognitive Rehabilitation Questions',
        };
      case 'settings':
        return {
          title: 'ตั้งค่าระบบและการประมวลผลชีวกลศาสตร์',
          subtitle: 'Biomechanics & AI Settings',
        };
      default:
        return {
          title: 'ระบบบริหารกายภาพบำบัด Dr.Tech.Care',
          subtitle: 'Physical Therapy Clinical Portal',
        };
    }
  };

  const pageMeta = getPageMeta(activeTab);

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans select-none relative">
      <TopProgressBar isLoading={isPageLoading} />

      <ClinicalSidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        queueBadgeCount={6}
        onLogout={onLogout}
        onReturnToKiosk={onReturnToKiosk}
        isPtMode={true}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <ClinicalTopHeader
          title={pageMeta.title}
          subtitleEn={pageMeta.subtitle}
          userName={currentUser?.full_name || 'กภ. ปิยะมาศ ภักดีชน'}
          userRoleTitle="นักกายภาพบำบัดวิชาชีพ (Senior Physical Therapist)"
          onOpenNewPatientModal={() => setIsNewPatientModalOpen(true)}
          onFastCheckIn={() => {
            setActiveTab('schedule');
          }}
          onLogout={onLogout}
          isPtMode={true}
        />

        <main
          style={{
            background: hospitalTheme.colors.workspaceBg,
          }}
          className="flex-1 overflow-y-auto"
        >
          {activeTab === 'patients' && (
            <MyPatientsView
              currentUserId={currentUser?.id || 'pt-01'}
              onOpenRecords={(_patient) => {
                // Open records view
              }}
            />
          )}
          {activeTab === 'schedule' && (
            <ClinicalScheduleView
              onOpenCreateScheduleModal={(_patientId) => {
                setIsNewPatientModalOpen(true);
              }}
            />
          )}
          {activeTab === 'pts' && <PhysiotherapistDirectoryView />}
          {activeTab === 'minigames' && <MiniGameQuestionsView />}
          {activeTab === 'settings' && <SystemAiSettingsView />}
        </main>
      </div>

      <NewPatientRegistrationModal
        isOpen={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onSuccess={(_id) => {
          setActiveTab('patients');
        }}
      />
    </div>
  );
};
