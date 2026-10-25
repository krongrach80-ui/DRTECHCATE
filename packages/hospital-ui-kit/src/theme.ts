/**
 * packages/hospital-ui-kit/src/theme.ts
 * Master Prompt v5 Section 1: Hospital Clinical Emerald-Teal & Medical Cyan Palette
 */

export const hospitalTheme = {
  colors: {
    // 1. Sidebar Background (Deep Forest Medical Teal)
    sidebarGradient: 'linear-gradient(180deg, #063932 0%, #042924 100%)',
    sidebarBase: '#063932',
    sidebarDark: '#042924',

    // 2. Active Sidebar Menu Pill (Clinical Sky-Cyan Gradient)
    activePillGradient: 'linear-gradient(90deg, #0EA5E9 0%, #0284C7 100%)',
    activePillGlow: '0 4px 14px rgba(14, 165, 233, 0.35)',

    // 3. Primary Action Button & Stepper (Medical Emerald-to-Blue Gradient)
    primaryGradient: 'linear-gradient(135deg, #10B981 0%, #059669 45%, #2563EB 100%)',
    primaryHoverGradient: 'linear-gradient(135deg, #34D399 0%, #10B981 45%, #3B82F6 100%)',
    primaryShadow: '0 8px 20px -4px rgba(16, 185, 129, 0.35)',

    // 4. Main Workspace Background (Sterile Mint-White)
    workspaceBg: 'radial-gradient(circle at top left, #F0FDF9 0%, #F8FAFC 60%, #EFF6FF 100%)',
    workspaceMint: '#F0FDF9',
    workspaceSlate: '#F8FAFC',
    workspaceBlue: '#EFF6FF',

    // 5. Card & Modal Surface
    cardSurface: '#FFFFFF',
    cardBorder: '#E2E8F0',
    cardBorderHover: '#A7F3D0',
    cardShadow: '0 10px 30px -5px rgba(6, 57, 50, 0.06)',
    cardShadowHover: '0 15px 35px -5px rgba(6, 57, 50, 0.12)',

    // 6. Status Badges
    status: {
      active: {
        bg: '#DCFCE7',
        text: '#15803D',
        dot: '#22C55E',
      },
      pending: {
        bg: '#FEF3C7',
        text: '#B45309',
        dot: '#F59E0B',
      },
      danger: {
        bg: '#FEE2E2',
        text: '#B91C1C',
        dot: '#EF4444',
      },
    },
  },
  animation: {
    springTransition: 'all 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    fluidEase: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;
