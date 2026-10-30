/**
 * packages/clinical-i18n/src/LanguageSwitcher.tsx
 *
 * Reusable Language Switcher Pill Component (zh-CN | th-TH | en-US)
 */

import React from 'react';
import { Globe } from 'lucide-react';
import { LANGUAGE_OPTIONS } from './index';
import { useClinicalI18n } from './index';

export const LanguageSwitcher: React.FC<{
  className?: string;
  variant?: 'light' | 'dark';
}> = ({ className = '', variant = 'light' }) => {
  const { lang, setLanguage } = useClinicalI18n();

  const isDark = variant === 'dark';

  return (
    <div
      className={`inline-flex items-center gap-1 p-1 rounded-xl border text-xs select-none transition-all ${
        isDark
          ? 'bg-slate-900/90 border-slate-700/80 text-slate-300'
          : 'bg-white border-slate-200/90 text-slate-700 shadow-sm'
      } ${className}`}
      data-testid="language-switcher"
    >
      <div className="pl-1.5 pr-0.5 text-teal-500">
        <Globe className="w-3.5 h-3.5" />
      </div>
      {LANGUAGE_OPTIONS.map((opt) => {
        const isActive = lang === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => setLanguage(opt.code)}
            className={`px-2 py-1 rounded-lg font-bold transition-all text-[11px] cursor-pointer ${
              isActive
                ? isDark
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                  : 'bg-teal-50 text-teal-800 border border-teal-300 shadow-xs'
                : isDark
                ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
            title={`Switch to ${opt.label}`}
          >
            {opt.flag} {opt.shortLabel}
          </button>
        );
      })}
    </div>
  );
};
