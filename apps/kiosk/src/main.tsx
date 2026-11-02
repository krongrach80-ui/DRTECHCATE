import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ClinicalI18nProvider } from '../../../packages/clinical-i18n/src/index';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ClinicalI18nProvider>
      <App />
    </ClinicalI18nProvider>
  </React.StrictMode>
);
