'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FilePlus,
  ShieldCheck,
  Clock,
  Send,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  User,
  Activity,
  AlertTriangle,
  Lock,
} from 'lucide-react';

interface PatientBrief {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  patients: {
    date_of_birth: string | null;
    sex: string | null;
    chief_complaint: string | null;
    diagnosis: string | null;
    allergies: string | null;
    chronic_diseases: string | null;
  } | null;
}

interface MedicalNoteItem {
  id: string;
  patient_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    full_name: string;
    username: string;
    role: string;
  } | null;
}

function MedicalNotesContent() {
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get('patientId') || '';

  const [patients, setPatients] = useState<PatientBrief[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId);
  const [selectedPatient, setSelectedPatient] = useState<PatientBrief | null>(null);
  const [notes, setNotes] = useState<MedicalNoteItem[]>([]);

  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New Note
  const [newNoteBody, setNewNoteBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 1. Fetch PT's accessible patients list
  const fetchPatients = useCallback(async () => {
    setLoadingPatients(true);
    try {
      const res = await fetch('/api/pt/patients');
      if (!res.ok) throw new Error('ไม่สามารถโหลดรายชื่อคนไข้ได้');
      const data = await res.json();
      const list = data.patients || [];
      setPatients(list);

      // If initialPatientId is provided or list has elements
      if (initialPatientId && list.some((p: PatientBrief) => p.id === initialPatientId)) {
        setSelectedPatientId(initialPatientId);
      } else if (list.length > 0 && !selectedPatientId) {
        setSelectedPatientId(list[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดคนไข้');
    } finally {
      setLoadingPatients(false);
    }
  }, [initialPatientId, selectedPatientId]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // 2. Fetch notes when selectedPatientId changes
  const fetchNotes = useCallback(async (patientId: string) => {
    if (!patientId) return;
    setLoadingNotes(true);
    setError(null);
    try {
      const res = await fetch(`/api/pt/medical-notes?patient_id=${encodeURIComponent(patientId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถโหลดเวชระเบียนได้');

      setSelectedPatient(data.patient || null);
      setNotes(data.notes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดเวชระเบียน');
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      fetchNotes(selectedPatientId);
    }
  }, [selectedPatientId, fetchNotes]);

  // Handle Append New Note
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !newNoteBody.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/pt/medical-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          body: newNoteBody.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกเวชระเบียนไม่สำเร็จ');

      setSuccessMessage('บันทึกเวชระเบียน (Append-Only) สำเร็จแล้ว');
      setNewNoteBody('');
      // Refresh notes list
      fetchNotes(selectedPatientId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 to-slate-900/40 border border-slate-800 backdrop-blur-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-2">
            <Lock className="w-3.5 h-3.5" />
            <span>มาตรฐานเวชระเบียน Append-Only (ห้ามลบ/แก้ไข)</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">บันทึกเวชระเบียนและพัฒนาการคนไข้</h1>
          <p className="text-xs text-slate-400 mt-1">
            บันทึกความก้าวหน้าการฟื้นฟู ข้อสังเกตทางคลินิก และแผนการรักษาอย่างโปร่งใสตามมาตรฐานความปลอดภัย
          </p>
        </div>

        {/* Patient Selection Dropdown */}
        <div className="flex items-center gap-2.5">
          <div className="text-xs text-slate-400 font-medium whitespace-nowrap">เลือกคนไข้:</div>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            disabled={loadingPatients || patients.length === 0}
            aria-label="เลือกคนไข้สำหรับดูและบันทึกเวชระเบียน"
            className="px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 min-w-[220px]"
          >
            {patients.length === 0 ? (
              <option value="">ไม่มีคนไข้ในความดูแล</option>
            ) : (
              patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.username})
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={() => selectedPatientId && fetchNotes(selectedPatientId)}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            title="รีเฟรชเวชระเบียน"
          >
            <RefreshCw className={`w-4 h-4 ${loadingNotes ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Patient Information Card */}
      {selectedPatient && (
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center font-bold text-white text-base">
                {selectedPatient.full_name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">{selectedPatient.full_name}</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    HN: {selectedPatient.username}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {selectedPatient.phone && <span>โทร: {selectedPatient.phone} • </span>}
                  <span>เพศ: {selectedPatient.patients?.sex === 'male' ? 'ชาย' : selectedPatient.patients?.sex === 'female' ? 'หญิง' : 'อื่นๆ'} • </span>
                  <span>วันเกิด: {selectedPatient.patients?.date_of_birth || 'ไม่ระบุ'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>สิทธิ์เข้าถึงเวชระเบียนสมบูรณ์</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 text-xs">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-1">การวินิจฉัย (Diagnosis):</span>
              <span className="font-semibold text-slate-200">
                {selectedPatient.patients?.diagnosis || '— ไม่ระบุ —'}
              </span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-1">อาการสำคัญ (Chief Complaint):</span>
              <span className="font-semibold text-slate-200">
                {selectedPatient.patients?.chief_complaint || '— ไม่ระบุ —'}
              </span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-1">ประวัติแพ้ยา (Allergies):</span>
              <span className="font-semibold text-rose-300">
                {selectedPatient.patients?.allergies || 'ปฏิเสธการแพ้ยา'}
              </span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-1">โรคประจำตัว (Chronic):</span>
              <span className="font-semibold text-slate-200">
                {selectedPatient.patients?.chronic_diseases || '— ไม่มี —'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Two-Column Layout: History Timeline vs Append Note Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Chronological Timeline (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">ลำดับประวัติการฟื้นฟู (Timeline — {notes.length} รายการ)</h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">เรียงจากอดีต ➔ ล่าสุด (Append-Only)</span>
          </div>

          <div className="space-y-4">
            {loadingNotes ? (
              <div className="p-12 text-center text-slate-500 rounded-2xl border border-slate-800 bg-slate-900/40">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-400 mb-2" />
                <span className="text-xs">กำลังโหลดบันทึกเวชระเบียน...</span>
              </div>
            ) : notes.length === 0 ? (
              <div className="p-12 text-center text-slate-500 rounded-2xl border border-slate-800 bg-slate-900/40">
                <FilePlus className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p className="text-xs">ยังไม่มีบันทึกเวชระเบียนสำหรับคนไข้รายนี้</p>
                <p className="text-[11px] text-slate-600 mt-1">สามารถเขียนบันทึกแรกได้จากกล่องด้านขวามือ</p>
              </div>
            ) : (
              notes.map((note, index) => {
                const noteDate = new Date(note.created_at);
                const formattedDate = noteDate.toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={note.id}
                    className="relative pl-6 pb-2 border-l-2 border-slate-800 last:border-l-transparent group"
                  >
                    {/* Timeline Node Icon */}
                    <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-900 border-2 border-blue-500 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow-sm space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-blue-400" />
                          <span className="font-bold text-white">
                            {note.author?.full_name || 'ผู้บันทึก'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-medium">
                            {note.author?.role?.toUpperCase() || 'PT'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{formattedDate}</span>
                          <span className="text-slate-600 font-mono">#{index + 1}</span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans bg-slate-950/40 p-3 rounded-lg border border-slate-800/40">
                        {note.body}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Append New Note Form (1 col) */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl shadow-xl space-y-4 sticky top-20">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <FilePlus className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">บันทึกเวชระเบียนใหม่</h3>
                <p className="text-[11px] text-slate-400">เพิ่มข้อความต่อท้าย (Append-Only)</p>
              </div>
            </div>

            <form onSubmit={handleCreateNote} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  ข้อความบันทึกความก้าวหน้า / SOAP Note <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={8}
                  required
                  placeholder="ตัวอย่างการบันทึก:
S: คนไข้แจ้งอาการปวดหลังลดลงจาก 7/10 เหลือ 3/10 หลังทำแบบฝึกหัด
O: ROM การก้มตัวทำได้เพิ่มขึ้น 15 องศา กล้ามเนื้อลดอาการเกร็ง
A: มีการตอบสนองต่อมินิเกมฟื้นฟูได้ดี
P: สั่งจ่ายคอร์สมินิเกมระดับกลางต่อเนื่อง 3 วัน/สัปดาห์"
                  value={newNoteBody}
                  onChange={(e) => setNewNoteBody(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-sans leading-relaxed text-xs"
                />
                <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1">
                  <span>ความยาว: {newNoteBody.length} ตัวอักษร</span>
                  <span>ขั้นต่ำ 3 ตัวอักษร</span>
                </div>
              </div>

              {/* Compliance Notice */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>ประกาศความยินยอมและกฎหมาย</span>
                </div>
                <p className="leading-relaxed">
                  เมื่อกดยืนยันแล้ว ข้อมูลจะถูกบันทึกลงสู่ฐานข้อมูลอย่างถาวร (ไม่มีปุ่มแก้ไข/ลบ) และมีการตรวจจับด้วย Database Trigger
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || !newNoteBody.trim() || !selectedPatientId}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'กำลังบันทึกเวชระเบียน...' : 'บันทึกเวชระเบียน (Append-Only)'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PTMidicalNotesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-2" />
          <span>กำลังโหลดเวชระเบียน...</span>
        </div>
      }
    >
      <MedicalNotesContent />
    </Suspense>
  );
}
