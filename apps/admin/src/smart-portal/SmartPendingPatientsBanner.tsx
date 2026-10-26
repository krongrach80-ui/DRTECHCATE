/**
 * apps/admin/src/smart-portal/SmartPendingPatientsBanner.tsx
 * Real-Time Pending Patients Queue & Permanent Deletion Controls
 * Conforms to Master Prompt v4 Step 2.2, Step 2.3 Option B, and Section 5
 */

import React, { useState, useEffect } from 'react';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';
import { SmartPatientModal } from './SmartPatientModal';
import {
  Trash2,
  Edit3,
  RefreshCw,
  ShieldAlert,
  Lock,
} from 'lucide-react';

interface SmartPendingPatientsBannerProps {
  onPatientUpdated?: () => void;
}

export const SmartPendingPatientsBanner: React.FC<SmartPendingPatientsBannerProps> = ({
  onPatientUpdated,
}) => {
  const [pendingPatients, setPendingPatients] = useState<PatientRecordFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPatient, setSelectedPatient] = useState<PatientRecordFile | null>(null);

  // Deletion confirm state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchPending = async () => {
    try {
      setLoading(true);
      const data = await defaultApiClient.smartOnboarding.listPending();
      setPendingPatients(Array.isArray(data) ? data : []);
    } catch {
      setPendingPatients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();

    // Listen to real-time SSE events
    const unsubscribe = defaultApiClient.connectEvents((eventPayload) => {
      const { event } = eventPayload;
      if (
        event === 'patient_registered' ||
        event === 'patient_info_completed' ||
        event === 'patient_deleted' ||
        event === 'patient_status'
      ) {
        fetchPending();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Permanent Delete Handler (Section 5)
  const handlePermanentDelete = async (patientId: string) => {
    setIsDeleting(true);
    try {
      await defaultApiClient.smartOnboarding.deletePatient(patientId);
      setPendingPatients((prev) => (Array.isArray(prev) ? prev : []).filter((p) => p.patient_id !== patientId));
      setDeletingId(null);
      onPatientUpdated?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถลบข้อมูลคนไข้ได้');
    } finally {
      setIsDeleting(false);
    }
  };

  const safePending = Array.isArray(pendingPatients) ? pendingPatients : [];

  if (loading && safePending.length === 0) {
    return null;
  }

  if (safePending.length === 0) {
    return null;
  }

  return (
    <div className="w-full mb-6 bg-gradient-to-r from-amber-950/30 via-slate-900 to-amber-950/20 border-2 border-amber-500/40 rounded-3xl p-5 shadow-2xl animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
          <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
            <span>คิวคนไข้สมัครใหม่จากตู้คีออส ({pendingPatients.length} รายการ)</span>
          </h2>
        </div>
        <button
          onClick={fetchPending}
          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>รีเฟรช</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pendingPatients.map((patient) => (
          <div
            key={patient.patient_id}
            className="bg-slate-950/80 border border-amber-500/30 hover:border-amber-500/60 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-lg transition"
          >
            <div className="flex items-start gap-3">
              <img
                src={patient.biometrics.registered_face_url}
                alt="Face Preview"
                className="w-14 h-14 rounded-xl object-cover border border-amber-500/50 bg-slate-900 shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="%23f59e0b" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
                }}
              />
              <div className="flex-1 min-w-0">
                <span className="inline-block px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold mb-1 truncate max-w-full">
                  🟡 บัญชีนี้ลงทะเบียนหน้าแล้ว รอลงข้อมูล
                </span>
                <div className="text-sm font-bold text-white truncate">
                  {patient.first_name} {patient.last_name || ''}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  HN: {patient.hn || patient.patient_id}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedPatient(patient)}
                className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-amber-950"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>กรอกข้อมูลคนไข้</span>
              </button>

              {patient.registration_status === 'active' ||
              (patient.first_name && patient.first_name !== 'รอลงข้อมูล') ? (
                <div
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5 text-xs font-semibold select-none shrink-0"
                  title="เวชระเบียนถาวรตามกฎหมายสถานพยาบาล บันทึกแล้วไม่สามารถลบบัญชีได้"
                >
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px]">เวชระเบียนถาวร</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeletingId(patient.patient_id)}
                  className="p-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 transition"
                  title="ลบฉบับร่างที่ยังไม่สมบูรณ์"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal for staff input (Option B) */}
      {selectedPatient && (
        <SmartPatientModal
          patient={selectedPatient}
          isOpen={true}
          onClose={() => setSelectedPatient(null)}
          onSuccess={() => {
            fetchPending();
            setSelectedPatient(null);
            onPatientUpdated?.();
          }}
        />
      )}

      {/* Permanent Deletion Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-red-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl text-slate-100 flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-1">
                ยืนยันการลบข้อมูลคนไข้แบบถาวร?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                ระบบจะลบข้อมูลออกจากฐานข้อมูล PostgreSQL และลบโฟลเดอร์{' '}
                <span className="font-mono text-red-300">
                  public/uploads/patients/{deletingId}/
                </span>{' '}
                ออกจากดิสก์จริงทั้งหมด ข้อมูลจะไม่กลับมาปรากฏอีกหลังรีเฟรชหน้าเว็บ
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handlePermanentDelete(deletingId)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังลบถาวร...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ยืนยันลบถาวร</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
