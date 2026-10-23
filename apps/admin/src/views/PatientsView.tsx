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
  ChevronRight
} from 'lucide-react';
import {
  PatientRecord,
  UserProfile,
  MedicalNoteRecord,
  TreatmentResultRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';

export const PatientsView: React.FC = () => {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
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
  const [createFormData, setCreateFormData] = useState({
    first_name: '',
    last_name: '',
    age: 30,
    sex: 'male' as 'male' | 'female' | 'other',
    phone: '',
    injury: '',
    responsible_pt_id: '',
  });

  // Action messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchPatients = async (query = '') => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await defaultApiClient.patients.list({ q: query || undefined });
      setPatients(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดทะเบียนคนไข้ได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchPts = async () => {
    try {
      const data = await defaultApiClient.staff.list();
      setPtsList(data.filter((u: UserProfile) => u.role === 'pt'));
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    fetchPatients();
    fetchPts();
  }, []);

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

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const created = await defaultApiClient.patients.create({
        ...createFormData,
        responsible_pt_id: createFormData.responsible_pt_id || undefined,
      });
      setSuccessMsg(`ลงทะเบียนคนไข้ใหม่สำเร็จ! ได้รับรหัส HN: ${created.hn}`);
      setIsCreateModalOpen(false);
      setCreateFormData({
        first_name: '',
        last_name: '',
        age: 30,
        sex: 'male',
        phone: '',
        injury: '',
        responsible_pt_id: '',
      });
      await fetchPatients();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลงทะเบียนคนไข้');
    } finally {
      setActionLoading(false);
    }
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
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถส่งไปตู้ได้');
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
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถเช็คอินได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBiometrics = async () => {
    if (!selectedPatient) return;
    const confirm = window.confirm(
      `ยืนยันการลบข้อมูลชีวมาตร (PDPA) ของ ${selectedPatient.first_name} ${selectedPatient.last_name}?\n\nการกระทำนี้จะลบไฟล์รูปหน้าและเวกเตอร์ 512 มิติทั้งหมดอย่างถาวร แต่ยังคงเวชระเบียนไว้`
    );
    if (!confirm) return;

    try {
      setActionLoading(true);
      await defaultApiClient.patients.deleteBiometrics(selectedPatient.id);
      setSuccessMsg('ลบข้อมูลชีวมาตรใบหน้าและเวกเตอร์ตามกฎหมาย PDPA สำเร็จ');
      if (selectedPatient) {
        setSelectedPatient({
          ...selectedPatient,
          registration_status: 'awaiting_face',
        });
      }
      await fetchPatients();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลบข้อมูลชีวมาตรได้');
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
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการปิดแฟ้มคนไข้');
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
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกเวชระเบียนได้');
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
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกผลการรักษาได้');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPatients = patients.filter((p) => {
    if (statusFilter === 'all') return true;
    return p.registration_status === statusFilter;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-teal-400" />
            <span>ทะเบียนคนไข้ (Patients Directory)</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            ค้นหาคนไข้ กำหนด PT ผู้รับผิดชอบ ส่งตั๋วสแกนหน้า และดูเวชระเบียนแบบไม่สามารถแก้ไขย้อนหลังได้
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchPatients(search)}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition shadow-lg shadow-teal-950/40"
          >
            <UserPlus className="w-4 h-4" />
            <span>ลงทะเบียนคนไข้ใหม่</span>
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

      {/* Search & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-center">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อไทย, นามสกุล, HN, เบอร์โทร..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-20 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-teal-600/30 text-teal-300 text-xs rounded-lg hover:bg-teal-600/50"
          >
            ค้นหา
          </button>
        </form>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300 focus:outline-none focus:border-teal-500"
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">รหัส HN</th>
                <th className="px-6 py-4 font-semibold">ชื่อ - นามสกุล</th>
                <th className="px-6 py-4 font-semibold">อายุ / เพศ</th>
                <th className="px-6 py-4 font-semibold">เบอร์โทร</th>
                <th className="px-6 py-4 font-semibold">สถานะชีวมาตร</th>
                <th className="px-6 py-4 font-semibold text-right">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                    <span>กำลังโหลดรายชื่อคนไข้...</span>
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    ไม่พบข้อมูลคนไข้
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    onClick={() => openPatientDetail(patient)}
                    className="hover:bg-slate-800/40 cursor-pointer transition"
                  >
                    <td className="px-6 py-4 font-mono font-bold text-teal-400">{patient.hn}</td>
                    <td className="px-6 py-4 font-medium text-white">
                      {patient.first_name} {patient.last_name}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {patient.age} ปี / {patient.sex === 'male' ? 'ชาย' : patient.sex === 'female' ? 'หญิง' : 'อื่นๆ'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                      {patient.phone || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {patient.registration_status === 'active' || patient.registration_status === 'face_enrolled' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>ลงทะเบียนหน้าแล้ว</span>
                        </span>
                      ) : patient.registration_status === 'awaiting_face' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          <Clock className="w-3 h-3" />
                          <span>รอสแกนหน้า 10 เฟรม</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
                          <Archive className="w-3 h-3" />
                          <span>ปิดแฟ้ม (Archived)</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="w-5 h-5 text-slate-500 inline" />
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
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-2xl h-screen flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/20 text-teal-300 font-bold text-lg flex items-center justify-center border border-teal-500/30">
                  {selectedPatient.first_name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>
                      {selectedPatient.first_name} {selectedPatient.last_name}
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/30">
                      {selectedPatient.hn}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    อายุ {selectedPatient.age} ปี • {selectedPatient.phone || 'ไม่มีเบอร์โทร'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tabs Navigation */}
            <div className="flex border-b border-slate-800 px-6 bg-slate-950/30">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3 px-4 text-sm font-semibold border-b-2 transition ${
                  activeTab === 'overview'
                    ? 'border-teal-400 text-teal-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                ข้อมูลและการจัดการ
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`py-3 px-4 text-sm font-semibold border-b-2 transition ${
                  activeTab === 'notes'
                    ? 'border-teal-400 text-teal-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                เวชระเบียน (Medical Notes)
              </button>
              <button
                onClick={() => setActiveTab('results')}
                className={`py-3 px-4 text-sm font-semibold border-b-2 transition ${
                  activeTab === 'results'
                    ? 'border-teal-400 text-teal-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                ผลการรักษา (Treatment Results)
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Actions Bar */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleSendToKiosk('kiosk-01')}
                      disabled={actionLoading}
                      className="p-3 rounded-xl bg-teal-600/20 text-teal-300 border border-teal-500/30 hover:bg-teal-600/30 flex items-center justify-center gap-2 text-xs font-semibold"
                    >
                      <Send className="w-4 h-4" />
                      <span>ส่งไปลงทะเบียนตู้ Kiosk</span>
                    </button>
                    <button
                      onClick={handleCheckin}
                      disabled={actionLoading}
                      className="p-3 rounded-xl bg-sky-600/20 text-sky-300 border border-sky-500/30 hover:bg-sky-600/30 flex items-center justify-center gap-2 text-xs font-semibold"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>เช็คอินเข้าคิววันนี้</span>
                    </button>
                  </div>

                  {/* Demographics Card */}
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      ข้อมูลอาการและประวัติผู้ป่วย
                    </h4>
                    <div>
                      <div className="text-xs text-slate-500">อาการบาดเจ็บ / การวินิจฉัย</div>
                      <div className="text-sm text-slate-200 font-medium">
                        {selectedPatient.injury || 'ไม่ได้ระบุ'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">นักกายภาพบำบัดผู้รับผิดชอบ</div>
                      <div className="text-sm text-slate-200 font-medium">
                        {ptsList.find((pt) => pt.id === selectedPatient.responsible_pt_id)?.full_name ||
                          'ยังไม่ได้ระบุ PT'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">เวอร์ชันบันทึกข้อมูล (OCC Version)</div>
                      <div className="text-xs font-mono text-slate-400">
                        Version {selectedPatient.version}
                      </div>
                    </div>
                  </div>

                  {/* Danger / PDPA Controls */}
                  <div className="bg-rose-500/5 p-5 rounded-2xl border border-rose-500/20 space-y-3">
                    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" />
                      <span>ความปลอดภัยและสิทธิข้อมูลส่วนบุคคล (PDPA)</span>
                    </h4>
                    <p className="text-xs text-slate-400">
                      คนไข้สามารถขอใช้สิทธิลบข้อมูลชีวมาตร (Biometric Data)
                      ระบบจะลบเวกเตอร์และรูปภาพใบหน้าออกจากพื้นที่จัดเก็บโดยถาวร แต่จะรักษาเวชระเบียนทางการแพทย์ไว้
                    </p>
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleDeleteBiometrics}
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 text-xs font-semibold"
                      >
                        ลบข้อมูลชีวมาตรใบหน้า (PDPA)
                      </button>
                      <button
                        onClick={handleArchivePatient}
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold"
                      >
                        ปิดแฟ้มประวัติ (Archive)
                      </button>
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

      {/* Create Patient Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-teal-400" />
                <span>ลงทะเบียนคนไข้ใหม่ (ออกเลข HN จาก Sequence)</span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePatient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ชื่อจริง *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น สมชาย"
                    value={createFormData.first_name}
                    onChange={(e) => setCreateFormData({ ...createFormData, first_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">นามสกุล *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น ใจดี"
                    value={createFormData.last_name}
                    onChange={(e) => setCreateFormData({ ...createFormData, last_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">อายุ (ปี) *</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    required
                    value={createFormData.age}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, age: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">เพศ *</label>
                  <select
                    value={createFormData.sex}
                    onChange={(e) => setCreateFormData({ ...createFormData, sex: e.target.value as 'male' | 'female' | 'other' })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="male">ชาย</option>
                    <option value="female">หญิง</option>
                    <option value="other">อื่นๆ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="tel"
                  placeholder="เช่น 0812345678"
                  value={createFormData.phone}
                  onChange={(e) => setCreateFormData({ ...createFormData, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  อาการบาดเจ็บ / วินิจฉัยเบื้องต้น
                </label>
                <input
                  type="text"
                  placeholder="เช่น ปวดหลังส่วนล่างเรื้อรัง (Low back pain)"
                  value={createFormData.injury}
                  onChange={(e) => setCreateFormData({ ...createFormData, injury: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  มอบหมายให้นักกายภาพบำบัด (PT)
                </label>
                <select
                  value={createFormData.responsible_pt_id}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, responsible_pt_id: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  <option value="">เลือกนักกายภาพบำบัดผู้รับผิดชอบ...</option>
                  {ptsList.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.full_name} (@{pt.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold shadow-lg shadow-teal-950/40 disabled:opacity-50"
                >
                  บันทึกคนไข้
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
