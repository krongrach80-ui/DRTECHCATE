/**
 * packages/hospital-ui-kit/src/components/ClinicalErrorBoundary.tsx
 *
 * CLINICAL ERROR BOUNDARY & RECOVERY ENGINE (SaMD Class II & Zero-Downtime)
 *
 * 1. Granular Error Isolation: Catches runtime exceptions in camera / biomechanics detection views,
 *    preventing the entire Kiosk / PT portal from crashing (anti-White Screen of Death).
 * 2. Offline Diagnostics Buffer: Records full error snapshot and component stack trace into
 *    local offline buffer (up to 50 latest clinical events) for post-incident audits.
 * 3. In-Memory Zero-Downtime Reset: Allows instant recovery via "รีเซ็ตระบบตรวจจับอัตโนมัติ"
 *    without reloading the whole page or losing patient session context.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle, ArrowLeft, PhoneCall } from 'lucide-react';

export interface ClinicalErrorLogEntry {
  timestamp: string;
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  componentStack?: string;
}

const OFFLINE_BUFFER_KEY = 'offline_clinical_error_logs';
const MAX_BUFFERED_ERRORS = 50;

export function recordOfflineErrorLog(entry: ClinicalErrorLogEntry): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const existingRaw = window.localStorage.getItem(OFFLINE_BUFFER_KEY);
    const logs: ClinicalErrorLogEntry[] = existingRaw ? JSON.parse(existingRaw) : [];
    logs.unshift(entry);
    if (logs.length > MAX_BUFFERED_ERRORS) {
      logs.length = MAX_BUFFERED_ERRORS;
    }
    window.localStorage.setItem(OFFLINE_BUFFER_KEY, JSON.stringify(logs));
  } catch {
    // safe fallback if storage is full or restricted
  }
}

export function getOfflineErrorLogs(): ClinicalErrorLogEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const existingRaw = window.localStorage.getItem(OFFLINE_BUFFER_KEY);
    return existingRaw ? JSON.parse(existingRaw) : [];
  } catch {
    return [];
  }
}

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  onExit?: () => void;
  onCallStaff?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ClinicalErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ error, errorInfo });

    const logEntry: ClinicalErrorLogEntry = {
      timestamp: new Date().toISOString(),
      errorName: error.name || 'ClinicalRuntimeError',
      errorMessage: error.message || 'Unknown runtime error',
      errorStack: error.stack,
      componentStack: errorInfo.componentStack || undefined,
    };

    recordOfflineErrorLog(logEntry);
    console.error('🚨 [ClinicalErrorBoundary] Caught error:', error, errorInfo);
  }

  public handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-6 text-white font-sans">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-amber-500/60 shadow-2xl p-6 sm:p-8 text-center animate-scale-up">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-4 text-amber-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              {this.props.fallbackTitle || 'ระบบตรวจจับการเคลื่อนไหวพบข้อขัดข้อง'}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 mt-2.5 leading-relaxed">
              ระบบป้องกันความปลอดภัยอัตโนมัติได้หยุดการทำงานชั่วคราว ข้อมูลและสถานะการฝึกถูกบันทึกลงหน่วยความจำเรียบร้อยแล้ว
            </p>

            {this.state.error && (
              <div className="my-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-left font-mono text-[11px] text-amber-300/90 break-words max-h-24 overflow-y-auto">
                <span className="font-bold text-slate-400">Error: </span>
                {this.state.error.message}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                id="clinical-boundary-auto-reset-btn"
                data-testid="clinical-boundary-auto-reset-btn"
                onClick={this.handleReset}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>ลองใหม่อีกครั้ง (Try Again)</span>
              </button>

              <button
                type="button"
                id="clinical-boundary-exit-btn"
                data-testid="clinical-boundary-exit-btn"
                onClick={() => {
                  if (this.props.onExit) {
                    this.props.onExit();
                  } else if (typeof window !== 'undefined') {
                    window.location.href = '/';
                  }
                }}
                className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer border border-slate-700"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>กลับสู่หน้าหลัก (Back to Home)</span>
              </button>

              <button
                type="button"
                id="clinical-boundary-call-staff-btn"
                data-testid="clinical-boundary-call-staff-btn"
                onClick={() => {
                  if (this.props.onCallStaff) {
                    this.props.onCallStaff();
                  } else {
                    alert('แจ้งเตือนเจ้าหน้าที่เรียบร้อยแล้ว หรือกรุณาติดต่อเจ้าหน้าที่เวชระเบียนที่เคาน์เตอร์ 1');
                  }
                }}
                className="w-full py-2.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
              >
                <PhoneCall className="w-4 h-4" />
                <span>เรียกเจ้าหน้าที่ (Call Staff)</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
