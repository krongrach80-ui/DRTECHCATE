'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  ArrowLeftRight,
  KeyRound,
  FilePlus,
  Gamepad2,
  Search,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  X,
  RefreshCw,
  Phone,
} from 'lucide-react';

interface PatientItem {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  careType: 'primary' | 'transferred';
  isPrimary: boolean;
  transferInfo: {
    fromPtName: string;
    startDate: string;
    endDate: string;
  } | null;
  patients: {
    date_of_birth: string | null;
    sex: string | null;
    chief_complaint: string | null;
    diagnosis: string | null;
    allergies: string | null;
    chronic_diseases: string | null;
    emergency_contact: string | null;
  } | null;
  face_enrollments: Array<{ id: string; status: string; created_at: string }> | null;
}

interface PTItem {
  id: string;
  full_name: string;
  username: string;
  pts: {
    license_no: string;
    specialty: string | null;
  } | null;
}

interface CaseTransferItem {
  id: string;
  patient_id: string;
  from_pt_id: string;
  to_pt_id: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed' | 'cancelled';
  direction: 'outgoing' | 'incoming';
  isCurrentlyActive: boolean;
  patient: { id: string; username: string; full_name: string; phone: string | null } | null;
  from_pt: { id: string; username: string; full_name: string } | null;
  to_pt: { id: string; username: string; full_name: string } | null;
}

export default function PTPatientsPage() {
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [ptsList, setPtsList] = useState<PTItem[]>([]);
  const [transfers, setTransfers] = useState<CaseTransferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<'patients' | 'transfers'>('patients');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientItem | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    full_name: '',
    phone: '',
    date_of_birth: '',
    sex: 'male',
    chief_complaint: '',
    diagnosis: '',
    allergies: '',
    chronic_diseases: '',
    emergency_contact: '',
  });

  const [transferForm, setTransferForm] = useState({
    patient_id: '',
    to_pt_id: '',
    start_date: '',
    end_date: '',
  });

  const [resetForm, setResetForm] = useState({
    new_password: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resPatients, resPts, resTransfers] = await Promise.all([
        fetch('/api/pt/patients'),
        fetch('/api/pt/pts-list'),
        fetch('/api/pt/case-transfers'),
      ]);

      if (!resPatients.ok) throw new Error('ไม่สามารถโหลดข้อมูลคนไข้ได้');
      const dataPatients = await resPatients.json();
      setPatients(dataPatients.patients || []);

      if (resPts.ok) {
        const dataPts = await resPts.json();
        setPtsList(dataPts.pts || []);
      }

      if (resTransfers.ok) {
        const dataTransfers = await resTransfers.json();
        setTransfers(dataTransfers.transfers || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredPatients = patients.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q)) ||
      (p.patients?.diagnosis && p.patients.diagnosis.toLowerCase().includes(q))
    );
  });

  // Handle Create Patient
  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/pt/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างคนไข้ไม่สำเร็จ');

      setSuccessMessage(`ลงทะเบียนคนไข้ใหม่: คุณ ${createForm.full_name} สำเร็จและมอบหมายเข้าความดูแลอัตโนมัติ`);
      setCreateModalOpen(false);
      setCreateForm({
        username: '',
        password: '',
        full_name: '',
        phone: '',
        date_of_birth: '',
        sex: 'male',
        chief_complaint: '',
        diagnosis: '',
        allergies: '',
        chronic_diseases: '',
        emergency_contact: '',
      });
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Case Transfer
  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/pt/case-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transferForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ฝากเคสไม่สำเร็จ');

      setSuccessMessage(data.message || 'บันทึกการฝากเคสชั่วคราวเรียบร้อยแล้ว');
      setTransferModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Password Reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/pt/patients/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          new_password: resetForm.new_password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');

      setSuccessMessage(data.message || 'รีเซ็ตรหัสผ่านสำเร็จ');
      setResetModalOpen(false);
      setResetForm({ new_password: '' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel/complete transfer
  const handleUpdateTransferStatus = async (transferId: string, status: 'cancelled' | 'completed') => {
    if (!confirm(status === 'cancelled' ? 'ยืนยันยกเลิกการฝากเคสนี้?' : 'ยืนยันจบการฝากเคสนี้?')) return;
    try {
      const res = await fetch('/api/pt/case-transfers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transfer_id: transferId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'อัปเดตไม่สำเร็จ');
      setSuccessMessage(data.message);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  const openTransferModalForPatient = (patient: PatientItem) => {
    setSelectedPatient(patient);
    setTransferForm({
      patient_id: patient.id,
      to_pt_id: ptsList[0]?.id || '',
      start_date: '',
      end_date: '',
    });
    setTransferModalOpen(true);
  };

  const openResetModalForPatient = (patient: PatientItem) => {
    setSelectedPatient(patient);
    setResetForm({ new_password: '' });
    setResetModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 to-slate-900/40 border border-slate-800 backdrop-blur-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>โมดูลคนไข้ & ฝากเคสชั่วคราว</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">คนไข้ในความดูแล (PT Care)</h1>
          <p className="text-xs text-slate-400 mt-1">
            เข้าถึงคนไข้ตามสิทธิ์ RLS: คนไข้หลักที่ได้รับมอบหมาย และเคสที่ฝากชั่วคราวระหว่างวันที่กำหนด
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>เพิ่มคนไข้ใหม่</span>
          </button>
          <button
            type="button"
            onClick={fetchData}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            title="รีเฟรช"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setTab('patients')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            tab === 'patients'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>รายชื่อคนไข้ ({patients.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('transfers')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            tab === 'transfers'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span>ประวัติและรายการฝากเคส ({transfers.length})</span>
        </button>
      </div>

      {/* TAB 1: Patients List */}
      {tab === 'patients' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัสผู้ป่วย (username), เบอร์โทร, หรืออาการวินิจฉัย..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 font-medium">
                <tr>
                  <th className="px-4 py-3.5">คนไข้</th>
                  <th className="px-4 py-3.5">สถานะการดูแล</th>
                  <th className="px-4 py-3.5">การวินิจฉัย (Diagnosis)</th>
                  <th className="px-4 py-3.5">สแกนใบหน้า</th>
                  <th className="px-4 py-3.5 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      <div className="inline-flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>กำลังโหลดข้อมูลคนไข้...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      ไม่พบคนไข้ในความดูแลที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((patient) => {
                    const hasFace = (patient.face_enrollments || []).some((f) => f.status === 'completed');

                    return (
                      <tr key={patient.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center font-bold text-white text-xs">
                              {patient.full_name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-white">{patient.full_name}</div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                <span>HN: {patient.username}</span>
                                {patient.phone && (
                                  <span className="flex items-center gap-0.5 text-slate-500">
                                    <Phone className="w-2.5 h-2.5" />
                                    {patient.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {patient.careType === 'primary' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <ShieldCheck className="w-3 h-3" />
                              <span>คนไข้หลักประจำตัว</span>
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Clock className="w-3 h-3" />
                                <span>เคสฝากชั่วคราว</span>
                              </span>
                              {patient.transferInfo && (
                                <div className="text-[10px] text-slate-400">
                                  จาก: {patient.transferInfo.fromPtName} (ถึง {patient.transferInfo.endDate})
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5 max-w-xs">
                          <div className="font-medium text-slate-200 truncate">
                            {patient.patients?.diagnosis || '— ยังไม่มีการวินิจฉัย —'}
                          </div>
                          {patient.patients?.chief_complaint && (
                            <div className="text-[11px] text-slate-400 truncate">
                              อาการ: {patient.patients.chief_complaint}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          {hasFace ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>ลงทะเบียนแล้ว</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">ยังไม่ลงทะเบียน</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Medical Notes Link */}
                            <Link
                              href={`/pt/medical-notes?patientId=${patient.id}`}
                              className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors"
                              title="ดูและบันทึกเวชระเบียน"
                            >
                              <FilePlus className="w-3.5 h-3.5" />
                            </Link>

                            {/* Schedule Link */}
                            <Link
                              href={`/pt/schedule?patientId=${patient.id}`}
                              className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 transition-colors"
                              title="จัดตารางฝึกมินิเกม"
                            >
                              <Gamepad2 className="w-3.5 h-3.5" />
                            </Link>

                            {/* Delegate / Transfer */}
                            {patient.isPrimary && (
                              <button
                                type="button"
                                onClick={() => openTransferModalForPatient(patient)}
                                className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-colors cursor-pointer"
                                title="ฝากเคสชั่วคราวให้ PT อื่น"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Reset Password */}
                            <button
                              type="button"
                              onClick={() => openResetModalForPatient(patient)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                              title="รีเซ็ตรหัสผ่านคนไข้"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Case Transfers History */}
      {tab === 'transfers' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 font-medium">
                <tr>
                  <th className="px-4 py-3.5">คนไข้</th>
                  <th className="px-4 py-3.5">ทิศทาง</th>
                  <th className="px-4 py-3.5">ผู้ส่งมอบ ➔ ผู้รับมอบ</th>
                  <th className="px-4 py-3.5">ช่วงวันที่มีผล</th>
                  <th className="px-4 py-3.5">สถานะ</th>
                  <th className="px-4 py-3.5 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      ยังไม่มีประวัติการฝากเคส
                    </td>
                  </tr>
                ) : (
                  transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white">{t.patient?.full_name}</div>
                        <div className="text-[11px] text-slate-400">HN: {t.patient?.username}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        {t.direction === 'outgoing' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                            <span>ฝากออกไป (Outgoing)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                            <span>รับฝากมา (Incoming)</span>
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-medium text-slate-200">
                          <span>{t.from_pt?.full_name}</span>
                          <span className="text-slate-500">➔</span>
                          <span className="text-emerald-400">{t.to_pt?.full_name}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            {t.start_date} ถึง {t.end_date}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        {t.status === 'active' ? (
                          t.isCurrentlyActive ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>มีผลอยู่ในปัจจุบัน</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                              <Clock className="w-3 h-3" />
                              <span>รอดำเนินการตามช่วงวัน</span>
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded-full">
                            <span>{t.status === 'cancelled' ? 'ยกเลิกแล้ว' : 'สิ้นสุดแล้ว'}</span>
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        {t.direction === 'outgoing' && t.status === 'active' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateTransferStatus(t.id, 'completed')}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors cursor-pointer"
                            >
                              จบการฝาก
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateTransferStatus(t.id, 'cancelled')}
                              className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] border border-rose-500/20 transition-colors cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Create Patient */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <UserPlus className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">ลงทะเบียนคนไข้ใหม่</h3>
                  <p className="text-xs text-slate-400">ระบบจะมอบหมายคนไข้เข้าความดูแลของท่านโดยอัตโนมัติ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePatient} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    รหัสประจำตัว / HN (Username) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น hn00124"
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    รหัสผ่านเริ่มต้น (ขั้นต่ำ 12 ตัวอักษร) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={12}
                    placeholder="ขั้นต่ำ 12 ตัวอักษร"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-medium mb-1">
                    ชื่อ-นามสกุล คนไข้ <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น นาย สมชาย ใจดี"
                    value={createForm.full_name}
                    onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">เบอร์โทรศัพท์ติดต่อ</label>
                  <input
                    type="tel"
                    placeholder="เช่น 0812345678"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">เพศ</label>
                  <select
                    value={createForm.sex}
                    onChange={(e) => setCreateForm({ ...createForm, sex: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="male">ชาย</option>
                    <option value="female">หญิง</option>
                    <option value="other">อื่นๆ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">วันเดือนปีเกิด</label>
                  <input
                    type="date"
                    value={createForm.date_of_birth}
                    onChange={(e) => setCreateForm({ ...createForm, date_of_birth: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">ผู้ติดต่อฉุกเฉิน</label>
                  <input
                    type="text"
                    placeholder="เช่น ญาติ (089-xxx-xxxx)"
                    value={createForm.emergency_contact}
                    onChange={(e) => setCreateForm({ ...createForm, emergency_contact: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-medium mb-1">การวินิจฉัยทางการแพทย์ (Diagnosis)</label>
                  <input
                    type="text"
                    placeholder="เช่น Chronic Lower Back Pain, Stroke Hemiparesis"
                    value={createForm.diagnosis}
                    onChange={(e) => setCreateForm({ ...createForm, diagnosis: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-medium mb-1">อาการสำคัญที่มาพบ (Chief Complaint)</label>
                  <textarea
                    rows={2}
                    placeholder="เช่น ปวดตึงบริเวณไหล่ขวาเรื้อรัง ยกแขนไม่สุด"
                    value={createForm.chief_complaint}
                    onChange={(e) => setCreateForm({ ...createForm, chief_complaint: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-medium mb-1">ประวัติแพ้ยา / อาหาร (Allergies)</label>
                  <input
                    type="text"
                    placeholder="เช่น ปฏิเสธการแพ้ยา"
                    value={createForm.allergies}
                    onChange={(e) => setCreateForm({ ...createForm, allergies: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  {submitting ? 'กำลังบันทึก...' : 'ยืนยันลงทะเบียนคนไข้'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Case Transfer */}
      {transferModalOpen && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <ArrowLeftRight className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">ฝากเคสชั่วคราว (Case Transfer)</h3>
                  <p className="text-xs text-slate-400">ส่งมอบการดูแลคนไข้ให้ PT ท่านอื่นในช่วงเวลาที่กำหนด</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 mb-4 text-xs">
              <div className="text-slate-400">คนไข้ที่จะส่งมอบ:</div>
              <div className="font-bold text-white text-sm">{selectedPatient.full_name}</div>
              <div className="text-[11px] text-slate-400">HN: {selectedPatient.username}</div>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  เลือกนักกายภาพบำบัดปลายทาง <span className="text-rose-400">*</span>
                </label>
                {ptsList.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-950 text-slate-400 border border-slate-800">
                    ไม่พบบัญชีนักกายภาพบำบัดท่านอื่นในระบบ
                  </div>
                ) : (
                  <select
                    required
                    value={transferForm.to_pt_id}
                    onChange={(e) => setTransferForm({ ...transferForm, to_pt_id: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                  >
                    {ptsList.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.full_name} ({pt.username}) {pt.pts?.specialty ? `— ${pt.pts.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    วันที่เริ่มต้น <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={transferForm.start_date}
                    onChange={(e) => setTransferForm({ ...transferForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    วันที่สิ้นสุด <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={transferForm.end_date}
                    onChange={(e) => setTransferForm({ ...transferForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 leading-relaxed">
                ตามนโยบายความปลอดภัย RLS: PT ปลายทางจะเห็นประวัติและบันทึกเวชระเบียนของคนไข้ได้เฉพาะในช่วงวันที่ระบุเท่านั้น เมื่อพ้นกำหนดสิทธิ์จะถูกระงับอัตโนมัติ
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTransferModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting || ptsList.length === 0}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  {submitting ? 'กำลังบันทึก...' : 'ยืนยันฝากเคส'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset Password (Strictly Patient) */}
      {resetModalOpen && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <KeyRound className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">รีเซ็ตรหัสผ่านคนไข้</h3>
                  <p className="text-xs text-slate-400">อนุญาตเฉพาะบัญชีประเภทผู้ป่วยเท่านั้น</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 mb-4 text-xs">
              <div className="text-slate-400">คนไข้:</div>
              <div className="font-bold text-white text-sm">{selectedPatient.full_name}</div>
              <div className="text-[11px] text-slate-400">Username: {selectedPatient.username}</div>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  รหัสผ่านใหม่ (ขั้นต่ำ 12 ตัวอักษร) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={12}
                  placeholder="อย่างน้อย 12 ตัวอักษร"
                  value={resetForm.new_password}
                  onChange={(e) => setResetForm({ new_password: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  {submitting ? 'กำลังบันทึก...' : 'ยืนยันรหัสผ่านใหม่'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
