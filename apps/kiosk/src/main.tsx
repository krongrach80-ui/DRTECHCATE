import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ClinicalI18nProvider } from '../../../packages/clinical-i18n/src/index';
import { ClinicalErrorBoundary } from '../../../packages/hospital-ui-kit/src/index';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ClinicalI18nProvider>
      <ClinicalErrorBoundary fallbackTitle="ระบบตรวจจับและบริการ Dr.Tech.Care Kiosk">
        <App />
      </ClinicalErrorBoundary>
    </ClinicalI18nProvider>
  </React.StrictMode>
);
