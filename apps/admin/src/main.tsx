import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClinicalI18nProvider } from '../../../packages/clinical-i18n/src/index';
import { App } from './App';
import './index.css';

const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ClinicalI18nProvider>
        <App />
      </ClinicalI18nProvider>
    </React.StrictMode>
  );
}
