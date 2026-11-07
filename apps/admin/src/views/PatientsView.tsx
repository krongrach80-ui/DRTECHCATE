import React, { useState, useEffect } from 'react';
import {
  Activity,
  UserPlus,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Clock,
  ShieldAlert,
  Send,
  Plus,
  Archive,
  ChevronRight,
  Trash2,
  Calendar,
  Camera,
} from 'lucide-react';
import {
  PatientRecord,
  UserProfile,
  MedicalNoteRecord,
  TreatmentResultRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';
import { removePatientFromLocalCache } from '../../../../packages/face-client/src/index.js';
import { SmartPendingPatientsBanner } from '../smart-portal/index.js';
import { PatientCoursePrescriptionModal } from '../clinical-ui/PatientCoursePrescriptionModal';
import { NewPatientRegistrationModal } from '../clinical-ui/NewPatientRegistrationModal';

const DEMO_PATIENTS: PatientRecord[] = [];

const formatPatientName = (first?: string, last?: string): string => {
  const cleanFirst = first?.trim() || '';
  const cleanLast = last && last.trim() !== '-' && last.trim() !== '' ? ` ${last.trim()}` : '';
  return `${cleanFirst}${cleanLast}`.trim() || 'ผู้ป่วย';
};

export const PatientsView: React.FC = () => {
  const [patients, setPatients] = useState<PatientRecord[]>(DEMO_PATIENTS);
  const [ptsList, setPtsList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Selected patient drawer state
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'results'>('overview');
  const [medicalNotes, setMedicalNotes] = useState<MedicalNoteRecord[]>([]);
  const [treatmentResults, setTreatmentResults] = useState<TreatmentResultRecord[]>([]);
  const [notesLoading, setNotesLoading] = useState<boolean>(false);
  const [newNoteBody, setNewNoteBody] = useState<string>('');
  const [newResultBody, setNewResultBody] = useState<string>('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState<boolean>(false);
  const [prescriptionPatientId, setPrescriptionPatientId] = useState<string | undefined>(undefined);
  const [reEnrollPatient, setReEnrollPatient] = useState<PatientRecord | null>(null);

  // Action messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchPatients = async (query = '') => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await defaultApiClient.patients.list({ q: query || undefined });
      const rawList = Array.isArray(data) ? data : ((data as any)?.patients || []);
      if (rawList.length > 0) {
        setPatients(rawList);
      } else if (!query) {
        setPatients(DEMO_PATIENTS);
      } else {
        setPatients([]);
      }
    } catch {
      if (!query) {
        setPatients(DEMO_PATIENTS);
      } else {
        setPatients([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPts = async () => {
    try {
      const [dirPts, staffList] = await Promise.all([
        defaultApiClient.directory.listPts().catch(() => []),
        defaultApiClient.staff.list({ role: 'pt' }).catch(() => []),
      ]);
      const combined = new Map<string, UserProfile>();
      if (Array.isArray(staffList)) {
        staffList.filter((u) => u.role === 'pt').forEach((pt) => combined.set(pt.id, pt));
      }
      if (Array.isArray(dirPts)) {
        dirPts.forEach((d: any) => {
          const ptId = d.id || d.user_id;
          if (ptId && !combined.has(ptId)) {
            combined.set(ptId, {
              id: ptId,
              username: d.username || 'pt',
              full_name: d.full_name || 'กภ. วิภาวี สุขใจ',
              role: 'pt',
              status: 'active',
              pt_details: d.pt_details,
            });
          }
        });
      }
      if (combined.size === 0) {
        combined.set('b1000000-0000-0000-0000-000000000003', {
          id: 'b1000000-0000-0000-0000-000000000003',
          username: 'pt_somchai',
          full_name: 'กภ. วิภาวี สุขใจ',
          role: 'pt',
          status: 'active',
          pt_details: {
            license_no: 'กภ.12345',
            specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
          },
        });
      }
      const list = Array.from(combined.values());
      setPtsList(list);
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    fetchPatients();
    fetchPts();

    const handlePatientCreated = () => {
      fetchPatients();
    };
    const handleStaffUpdated = () => {
      fetchPts();
    };
    window.addEventListener('patient-created', handlePatientCreated);
    window.addEventListener('staff-updated', handleStaffUpdated);
    return () => {
      window.removeEventListener('patient-created', handlePatientCreated);
      window.removeEventListener('staff-updated', handleStaffUpdated);
    };
  }, []);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPatients(search);
  };

  const openPatientDetail = async (patient: PatientRecord) => {
    setSelectedPatient(patient);
    setActiveTab('overview');
    try {
      setNotesLoading(true);
      const [notes, results] = await Promise.all([
        defaultApiClient.records.getNotes(patient.id).catch(() => []),
        defaultApiClient.records.getTreatmentResults(patient.id).catch(() => []),
      ]);
      setMedicalNotes(notes);
      setTreatmentResults(results);
    } finally {
      setNotesLoading(false);
    }
  };

  const handlePatientError = (err: unknown, defaultMessage: string) => {
    const msg = err instanceof Error ? err.message : String(err || defaultMessage);
    setErrorMsg(msg || defaultMessage);
  };



  const handleSendToKiosk = async (kioskId = 'kiosk-01') => {
    if (!selectedPatient) return;
    try {
      setActionLoading(true);
      const res = await defaultApiClient.patients.sendToKiosk(selectedPatient.id, kioskId);
      setSuccessMsg(
        `ออกตั๋วลงทะเบียนใบหน้า (${res.ticket_id}) ส่งไปยังตู้ ${kioskId} สำเร็จ หมดอายุใน 10 นาที`
      );
    } catch (err: unknown) {
      handlePatientError(err, 'ไม่สามารถส่งไปตู้ได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckin = async () => {
    if (!selectedPatient) return;
    try {
      setActionLoading(true);
      await defaultApiClient.patients.checkin(selectedPatient.id);
      setSuccessMsg(`เช็คอินคนไข้ ${selectedPatient.first_name} เข้าคิววันนี้สำเร็จ (พร้อมเทียบใบหน้าที่ตู้)`);
    } catch (err: unknown) {
      handlePatientError(err, 'ไม่สามารถเช็คอินได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!selectedPatient) return;
    const confirm = window.confirm(
      `ยืนยันการลบคนไข้ ${selectedPatient.first_name} ${selectedPatient.last_name} (HN: ${selectedPatient.hn}) ออกจากระบบอย่างถาวร?\n\nคำเตือน: ข้อมูลประวัติคนไข้ รูปหน้า สแกนใบหน้าชีวมาตร และบันทึกเวชระเบียนทั้งหมดจะถูกลบออกจากฐานข้อมูล Supabase อย่างถาวร และจะไม่สามารถกู้คืนได้`
    );
    if (!confirm) return;

    try {
      setActionLoading(true);
      await defaultApiClient.patients.delete(selectedPatient.id);
      removePatientFromLocalCache(selectedPatient.id);
      if (selectedPatient.hn) removePatientFromLocalCache(selectedPatient.hn);
      setSuccessMsg(`ลบคนไข้ ${selectedPatient.first_name} (HN: ${selectedPatient.hn}) ออกจากระบบเรียบร้อยแล้ว`);
      const deletedId = selectedPatient.id;
      setSelectedPatient(null);
      setPatients((prev) => (Array.isArray(prev) ? prev.filter((p) => p.id !== deletedId) : []));
      await fetchPatients();
    } catch (err: unknown) {
      handlePatientError(err, 'ไม่สามารถลบข้อมูลคนไข้ได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePatientDirect = async (p: PatientRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirm = window.confirm(
      `ยืนยันการลบคนไข้ ${p.first_name} ${p.last_name} (HN: ${p.hn}) ออกจากระบบอย่างถาวร?\n\nคำเตือน: ข้อมูลประวัติคนไข้และข้อมูลทั้งหมดจะถูกลบออกจากระบบอย่างถาวร (คนไข้จะหายไปจากตารางทันที)`
    );
    if (!confirm) return;

    try {
      setActionLoading(true);
      await defaultApiClient.patients.delete(p.id);
      removePatientFromLocalCache(p.id);
      if (p.hn) removePatientFromLocalCache(p.hn);
      setSuccessMsg(`ลบคนไข้ ${p.first_name} (HN: ${p.hn}) ออกจากระบบเรียบร้อยแล้ว`);
      if (selectedPatient?.id === p.id) {
        setSelectedPatient(null);
      }
      setPatients((prev) => (Array.isArray(prev) ? prev.filter((item) => item.id !== p.id) : []));
      await fetchPatients();
    } catch (err: unknown) {
      handlePatientError(err, 'ไม่สามารถลบข้อมูลคนไข้ได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBiometrics = async () => {
    if (!selectedPatient) return;
    const confirm = window.confirm(
      `ยืนยันการลบ/รีเซ็ตเฉพาะข้อมูลชีวมาตรใบหน้า (PDPA) ของ ${selectedPatient.first_name} ${selectedPatient.last_name}?\n\nหมายเหตุ: การกระทำนี้จะลบเฉพาะไฟล์รูปหน้าและเวกเตอร์ 512 มิติ เพื่อให้สแกนหน้าใหม่ โดยประวัติคนไข้จะยังคงอยู่ในระบบ (สถานะเปลี่ยนเป็นรอสแกนหน้า)\n\nหากต้องการลบคนไข้ทิ้งออกจากระบบ กรุณาใช้ปุ่ม "ลบคนไข้ถาวร"`
    );
    if (!confirm) return;

    try {
      setActionLoading(true);
      await defaultApiClient.patients.deleteBiometrics(selectedPatient.id);
      removePatientFromLocalCache(selectedPatient.id);
      if (selectedPatient.hn) removePatientFromLocalCache(selectedPatient.hn);
      setSuccessMsg('ลบข้อมูลชีวมาตรใบหน้าและเวกเตอร์ตามกฎหมาย PDPA สำเร็จ (สถานะเปลี่ยนเป็นรอสแกนหน้า)');
      const updatedPatient: PatientRecord = {
        ...selectedPatient,
        registration_status: 'awaiting_face',
      };
      setSelectedPatient(updatedPatient);
      await fetchPatients();
      // Auto-trigger 10-frame re-scan modal immediately!
      setReEnrollPatient(updatedPatient);
    } catch (err: unknown) {
      handlePatientError(err, 'ไม่สามารถลบข้อมูลชีวมาตรได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchivePatient = async () => {
    if (!selectedPatient) return;
    if (!window.confirm(`ยืนยันการปิดแฟ้ม (Archive) คนไข้ ${selectedPatient.first_name}?`)) return;

    try {
      setActionLoading(true);
      await defaultApiClient.patients.archive(selectedPatient.id);
      setSuccessMsg(`ปิดแฟ้มประวัติ ${selectedPatient.first_name} เรียบร้อยแล้ว`);
      setSelectedPatient(null);
      await fetchPatients();
    } catch (err: unknown) {
      handlePatientError(err, 'เกิดข้อผิดพลาดในการปิดแฟ้มคนไข้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddMedicalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !newNoteBody.trim()) return;

    try {
      setActionLoading(true);
      const note = await defaultApiClient.records.createNote(selectedPatient.id, newNoteBody.trim());
      setMedicalNotes([note, ...medicalNotes]);
      setNewNoteBody('');
      setSuccessMsg('บันทึกเวชระเบียนใหม่เรียบร้อย (Append-only)');
    } catch (err: unknown) {
      handlePatientError(err, 'ไม่สามารถบันทึกเวชระเบียนได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddTreatmentResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !newResultBody.trim()) return;

    try {
      setActionLoading(true);
      const result = await defaultApiClient.records.createTreatmentResult(
        selectedPatient.id,
        newResultBody.trim()
      );
      setTreatmentResults([result, ...treatmentResults]);
      setNewResultBody('');
      setSuccessMsg(`บันทึกผลการรักษาใหม่ (เวอร์ชัน ${result.version}) เรียบร้อย`);
    } catch (err: unknown) {
      handlePatientError(err, 'ไม่สามารถบันทึกผลการรักษาได้');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPatients = (Array.isArray(patients) ? patients : []).filter((p) => {
    if (statusFilter === 'all') return true;
    return p.registration_status === statusFilter;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Activity className="w-6 h-6 text-teal-600" />
            <span>ทะเบียนคนไข้ (Patients Directory)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            ค้นหาคนไข้ กำหนด PT ผู้รับผิดชอบ ส่งตั๋วสแกนหน้า และดูเวชระเบียนแบบไม่สามารถแก้ไขย้อนหลังได้
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchPatients(search)}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="whitespace-nowrap shrink-0 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">+ ลงทะเบียนคนไข้ใหม่</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Master Prompt v4: Pending Patients Real-time Queue Banner */}
      <SmartPendingPatientsBanner onPatientUpdated={() => fetchPatients(search)} />

      {/* Search & Filter Bar */}
      <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-3 flex flex-col md:flex-row gap-3 justify-between items-center shadow-xs">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อไทย, นามสกุล, HN, เบอร์โทร..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-24 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
          >
            ค้นหา
          </button>
        </form>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          >
            <option value="all">ทุกสถานะใบหน้า</option>
            <option value="awaiting_face">รอสแกนหน้า (Awaiting Face)</option>
            <option value="face_enrolled">สแกนหน้าแล้ว (Enrolled)</option>
            <option value="active">พร้อมรับการรักษา (Active)</option>
            <option value="archived">ปิดแฟ้มประวัติ (Archived)</option>
          </select>
        </div>
      </div>

      {/* Patients Table */}
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-blue-50/80 text-blue-950 font-semibold text-xs uppercase tracking-wider border-b border-blue-100">
              <tr>
                <th className="px-6 py-4 font-semibold whitespace-nowrap">รหัส HN</th>
                <th className="px-6 py-4 font-semibold whitespace-nowrap">ชื่อ - นามสกุล</th>
                <th className="px-6 py-4 font-semibold whitespace-nowrap">อายุ / เพศ</th>
                <th className="px-6 py-4 font-semibold whitespace-nowrap">เบอร์โทร</th>
                <th className="px-6 py-4 font-semibold whitespace-nowrap">สถานะชีวมาตร</th>
                <th className="px-6 py-4 font-semibold text-right whitespace-nowrap">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="bg-white hover:bg-emerald-50/40 divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 whitespace-nowrap">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
                    <span>กำลังโหลดรายชื่อคนไข้...</span>
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 whitespace-nowrap">
                    ไม่พบข้อมูลคนไข้
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    onClick={() => openPatientDetail(patient)}
                    className="hover:bg-emerald-50/40 cursor-pointer transition"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="whitespace-nowrap inline-block px-3 py-1 rounded-lg bg-blue-50 text-blue-700 font-mono font-bold text-xs border border-blue-200">
                        {patient.hn}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                      {formatPatientName(patient.first_name, patient.last_name)}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-700 font-medium whitespace-nowrap">
                      {patient.age} ปี / {patient.sex === 'male' ? 'ชาย' : patient.sex === 'female' ? 'หญิง' : 'อื่นๆ'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600 font-mono whitespace-nowrap">
                      {patient.phone || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {patient.registration_status === 'active' || patient.registration_status === 'face_enrolled' ? (
                        <span className="whitespace-nowrap inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>● ลงทะเบียนหน้าแล้ว</span>
                        </span>
                      ) : patient.registration_status === 'awaiting_face' ? (
                        <span className="whitespace-nowrap inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full text-xs font-bold">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>รอสแกนหน้า 10 เฟรม</span>
                        </span>
                      ) : (
                        <span className="whitespace-nowrap inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full text-xs font-semibold">
                          <Archive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>ปิดแฟ้ม (Archived)</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {patient.registration_status === 'awaiting_face' && (
                          <button
                            type="button"
                            onClick={() => setReEnrollPatient(patient)}
                            className="whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm hover:shadow-md cursor-pointer active:scale-95"
                            title="เปิดขั้นตอนสแกนใบหน้าใหม่ 10 เฟรม (Face ID)"
                          >
                            <Camera className="w-3.5 h-3.5 shrink-0" />
                            <span className="whitespace-nowrap">📷 สแกนใบหน้าใหม่</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPrescriptionPatientId(patient.id);
                            setIsPrescriptionModalOpen(true);
                          }}
                          className="whitespace-nowrap shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm hover:shadow-md cursor-pointer active:scale-95"
                          title="จัดคอร์สออกกำลังกาย / แก้ไขท่าฝึกเฉพาะบุคคล"
                        >
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span className="whitespace-nowrap">จัดคอร์ส/สั่งจ่าย</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeletePatientDirect(patient, e)}
                          disabled={actionLoading}
                          title="ลบคนไข้คนนี้ออกจากระบบอย่างถาวร"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openPatientDetail(patient)}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 transition cursor-pointer"
                        >
                          <ChevronRight className="w-5 h-5 inline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Patient Detail Drawer */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-white border-l border-blue-100 w-full max-w-2xl h-screen flex flex-col shadow-2xl overflow-hidden text-slate-800">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-blue-50/60">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-blue-600 text-white font-bold text-lg flex items-center justify-center shadow-sm">
                  {selectedPatient.first_name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span>
                      {formatPatientName(selectedPatient.first_name, selectedPatient.last_name)}
                    </span>
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                      HN: {selectedPatient.hn}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    อายุ {selectedPatient.age} ปี • {selectedPatient.phone || 'ไม่มีเบอร์โทร'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tabs Navigation */}
            <div className="flex border-b border-slate-200 px-6 bg-slate-50/70">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3 px-4 text-sm font-semibold border-b-2 transition cursor-pointer ${
                  activeTab === 'overview'
                    ? 'border-emerald-600 text-emerald-700 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                ข้อมูลและการจัดการ
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`py-3 px-4 text-sm font-semibold border-b-2 transition cursor-pointer ${
                  activeTab === 'notes'
                    ? 'border-emerald-600 text-emerald-700 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                เวชระเบียน (Medical Notes)
              </button>
              <button
                onClick={() => setActiveTab('results')}
                className={`py-3 px-4 text-sm font-semibold border-b-2 transition cursor-pointer ${
                  activeTab === 'results'
                    ? 'border-emerald-600 text-emerald-700 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                ผลการรักษา (Treatment Results)
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Actions Bar */}
                  <div className="grid grid-cols-2 gap-3">
                    {selectedPatient.registration_status === 'awaiting_face' && (
                      <button
                        type="button"
                        onClick={() => setReEnrollPatient(selectedPatient)}
                        className="col-span-2 p-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition cursor-pointer active:scale-98 animate-pulse"
                      >
                        <Camera className="w-4 h-4" />
                        <span>📷 สแกนใบหน้าใหม่ (Face ID 10 เฟรม)</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPrescriptionPatientId(selectedPatient.id);
                        setIsPrescriptionModalOpen(true);
                      }}
                      className="col-span-2 p-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>📋 จัดคอร์สออกกำลังกาย / แก้ไขท่าฝึกเฉพาะบุคคล</span>
                    </button>
                    <button
                      onClick={() => handleSendToKiosk('kiosk-01')}
                      disabled={actionLoading}
                      className="p-3 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer transition"
                    >
                      <Send className="w-4 h-4" />
                      <span>ส่งไปลงทะเบียนตู้ Kiosk</span>
                    </button>
                    <button
                      onClick={handleCheckin}
                      disabled={actionLoading}
                      className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>เช็คอินเข้าคิววันนี้</span>
                    </button>
                  </div>

                  {/* Demographics Card */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      ข้อมูลอาการและประวัติผู้ป่วย
                    </h4>
                    <div>
                      <div className="text-xs text-slate-400">อาการบาดเจ็บ / การวินิจฉัย</div>
                      <div className="text-sm text-slate-800 font-medium">
                        {selectedPatient.injury || 'ไม่ได้ระบุ'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">นักกายภาพบำบัดผู้รับผิดชอบ</div>
                      <div className="text-sm text-slate-800 font-medium">
                        {ptsList.find((pt) => pt.id === selectedPatient.responsible_pt_id)?.full_name ||
                          'ยังไม่ได้ระบุ PT'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">เวอร์ชันบันทึกข้อมูล (OCC Version)</div>
                      <div className="text-xs font-mono text-slate-600">
                        Version {selectedPatient.version}
                      </div>
                    </div>
                  </div>

                  {/* Danger & Patient Management Controls */}
                  <div className="bg-rose-50/50 p-5 rounded-2xl border border-rose-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        <span>การจัดการข้อมูลความปลอดภัย, PDPA และการลบบัญชี</span>
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 text-xs text-slate-600">
                      {/* 1. Permanent Patient Deletion */}
                      <div className="p-3 rounded-xl bg-white border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                        <div>
                          <div className="font-semibold text-rose-700 flex items-center gap-1.5">
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>ลบคนไข้ถาวร (ลบออกจากระบบทั้งประวัติและใบหน้า)</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            ลบข้อมูลผู้ป่วย รูปหน้า เวกเตอร์ชีวมาตร และประวัติทั้งหมดออกจากฐานข้อมูล Supabase อย่างถาวร (คนไข้จะหายไปจากตารางทันที)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleDeletePatient}
                          disabled={actionLoading}
                          className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition flex items-center gap-1.5 whitespace-nowrap self-start sm:self-center shadow-xs cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ลบคนไข้ถาวร</span>
                        </button>
                      </div>

                      {/* 2. Biometric PDPA Reset */}
                      <div className="p-3 rounded-xl bg-white border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                        <div>
                          <div className="font-semibold text-amber-700 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>รีเซ็ตเฉพาะข้อมูลใบหน้า (PDPA Biometric Reset)</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            ลบเฉพาะข้อมูลชีวมาตรใบหน้าเพื่อขอสแกนหน้าใหม่ แต่ยังคงเก็บข้อมูลและเวชระเบียนคนไข้ไว้ในตาราง (สถานะเปลี่ยนเป็นรอสแกนหน้า)
                          </p>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-center">
                          {selectedPatient.registration_status === 'awaiting_face' && (
                            <button
                              type="button"
                              onClick={() => setReEnrollPatient(selectedPatient)}
                              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs active:scale-95"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>📷 สแกนใบหน้าใหม่</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleDeleteBiometrics}
                            disabled={actionLoading}
                            className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-xs transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <span>รีเซ็ตเฉพาะใบหน้า</span>
                          </button>
                        </div>
                      </div>

                      {/* 3. Soft Archive */}
                      <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                        <div>
                          <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                            <Archive className="w-3.5 h-3.5 text-slate-500" />
                            <span>ปิดแฟ้มประวัติ (Archive)</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            ยุติคอร์สการรักษาและจัดเก็บแฟ้มประวัติเข้าสู่คลังเอกสาร
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleArchivePatient}
                          disabled={actionLoading}
                          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition flex items-center gap-1.5 whitespace-nowrap self-start sm:self-center cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>ปิดแฟ้ม</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="space-y-4">
                  {/* Append Note Form */}
                  <form onSubmit={handleAddMedicalNote} className="space-y-3">
                    <label className="block text-xs font-bold text-slate-300">
                      เพิ่มบันทึกเวชระเบียนใหม่ (Append-Only)
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="บันทึกอาการ การตรวจร่างกาย หรือคำแนะนำจากแพทย์..."
                      value={newNoteBody}
                      onChange={(e) => setNewNoteBody(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !newNoteBody.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>บันทึกโน้ต</span>
                    </button>
                  </form>

                  {/* Notes Timeline */}
                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      ประวัติเวชระเบียนที่บันทึกแล้ว ({medicalNotes.length})
                    </h4>
                    {notesLoading ? (
                      <div className="text-center py-6 text-slate-500 text-xs">กำลังโหลดบันทึก...</div>
                    ) : medicalNotes.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">ยังไม่มีบันทึกเวชระเบียน</div>
                    ) : (
                      medicalNotes.map((note) => (
                        <div
                          key={note.id}
                          className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-semibold text-teal-400">
                              {note.author_name || 'เจ้าหน้าที่'}
                            </span>
                            <span>{new Date(note.created_at).toLocaleString('th-TH')}</span>
                          </div>
                          <p className="text-sm text-slate-200 whitespace-pre-wrap">{note.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'results' && (
                <div className="space-y-4">
                  {/* Append Versioned Result Form */}
                  <form onSubmit={handleAddTreatmentResult} className="space-y-3">
                    <label className="block text-xs font-bold text-slate-300">
                      บันทึกผลการรักษา / ประเมินความก้าวหน้า (สร้างเวอร์ชันใหม่)
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="สรุปผลการฝึก อาการปวด ความคล่องตัว (สร้างเวอร์ชันถัดไปอัตโนมัติ)..."
                      value={newResultBody}
                      onChange={(e) => setNewResultBody(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !newResultBody.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>บันทึกผลการรักษา (Version ใหม่)</span>
                    </button>
                  </form>

                  {/* Results Timeline */}
                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      ประวัติผลการรักษาทุกเวอร์ชัน ({treatmentResults.length})
                    </h4>
                    {notesLoading ? (
                      <div className="text-center py-6 text-slate-500 text-xs">กำลังโหลดผลการรักษา...</div>
                    ) : treatmentResults.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">ยังไม่มีผลการรักษา</div>
                    ) : (
                      treatmentResults.map((r) => (
                        <div
                          key={r.id}
                          className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-bold text-purple-400">
                              เวอร์ชัน {r.version} {r.supersedes_id && `(แทนที่ V${r.version - 1})`}
                            </span>
                            <span>{new Date(r.created_at).toLocaleString('th-TH')}</span>
                          </div>
                          <p className="text-sm text-slate-200 whitespace-pre-wrap">{r.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3-Step New Patient Registration Modal (Reused Staff-Assisted Modal) */}
      <NewPatientRegistrationModal
        isOpen={isCreateModalOpen}
        mode="admin"
        staffUser={defaultApiClient.getUserProfile() || undefined}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={async (newPatientId, action) => {
          setIsCreateModalOpen(false);
          await fetchPatients();
          window.dispatchEvent(new CustomEvent('patient-created', { detail: { id: newPatientId } }));
          if (action === 'course') {
            setPrescriptionPatientId(newPatientId);
            setIsPrescriptionModalOpen(true);
          } else {
            setSuccessMsg('ลงทะเบียนคนไข้ใหม่และบันทึกใบหน้าชีวมิติ 10 เฟรมสำเร็จเรียบร้อย');
          }
        }}
      />

      {/* Biometric Re-enrollment Modal for existing patient (PDPA Renewal) */}
      <NewPatientRegistrationModal
        isOpen={Boolean(reEnrollPatient)}
        mode="admin"
        existingPatient={
          reEnrollPatient
            ? {
                id: reEnrollPatient.id,
                hn: reEnrollPatient.hn,
                name: formatPatientName(reEnrollPatient.first_name, reEnrollPatient.last_name),
              }
            : null
        }
        staffUser={defaultApiClient.getUserProfile() || undefined}
        onClose={() => setReEnrollPatient(null)}
        onSuccess={async (patientId) => {
          setReEnrollPatient(null);
          await fetchPatients();
          if (selectedPatient && selectedPatient.id === patientId) {
            setSelectedPatient((prev) => (prev ? { ...prev, registration_status: 'active' } : null));
          }
          setSuccessMsg('บันทึกข้อมูลใบหน้าใหม่ 10 เฟรมสำเร็จแล้ว (สถานะเปลี่ยนเป็นลงทะเบียนหน้าแล้ว)');
        }}
      />

      {/* Patient Course Prescription Modal */}
      <PatientCoursePrescriptionModal
        isOpen={isPrescriptionModalOpen}
        onClose={() => setIsPrescriptionModalOpen(false)}
        preselectedPatientId={prescriptionPatientId}
        onSuccess={() => {
          fetchPatients();
        }}
      />
    </div>
  );
};
