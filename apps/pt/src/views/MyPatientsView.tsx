import React, { useState, useEffect } from 'react';
import {
  Search,
  Users,
  Eye,
  Edit,
  Archive,
  ArrowRightLeft,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Clock,
  Sparkles
} from 'lucide-react';
import {
  PatientRecord,
  CaseTransferRecord,
  PtDirectoryRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';

interface MyPatientsViewProps {
  currentUserId: string;
  onOpenRecords: (patient: PatientRecord) => void;
}

export const MyPatientsView: React.FC<MyPatientsViewProps> = ({
  currentUserId,
  onOpenRecords,
}) => {
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [delegatedTransfers, setDelegatedTransfers] = useState<CaseTransferRecord[]>([]);
  const [ptsList, setPtsList] = useState<PtDirectoryRecord[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'direct' | 'transferred'>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals & Drawers
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    first_name: '',
    last_name: '',
    age: 0,
    phone: '',
    injury: '',
  });

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFormData, setTransferFormData] = useState({
    to_pt_id: '',
    reason: '',
    start_date: '',
    end_date: '',
  });

  const fetchPatients = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [pts, transfers, directory] = await Promise.all([
        defaultApiClient.patients.list({ q: search.trim() || undefined, limit: 100 }),
        defaultApiClient.caseTransfers.list().catch(() => []),
        defaultApiClient.directory.listPts().catch(() => []),
      ]);
      setPatients(pts);
      setDelegatedTransfers(transfers);
      setPtsList(directory);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดรายชื่อคนไข้ได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Handle Edit Patient (Optimistic locking with version)
  const handleOpenEdit = (p: PatientRecord) => {
    setSelectedPatient(p);
    setEditFormData({
      first_name: p.first_name,
      last_name: p.last_name,
      age: p.age,
      phone: p.phone || '',
      injury: p.injury || '',
    });
    setIsEditModalOpen(true);
  };

  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      setActionLoading(true);
      await defaultApiClient.patients.update(selectedPatient.id, {
        first_name: editFormData.first_name.trim(),
        last_name: editFormData.last_name.trim(),
        age: editFormData.age,
        phone: editFormData.phone.trim() || undefined,
        injury: editFormData.injury.trim() || undefined,
        version: selectedPatient.version, // Optimistic lock
      });

      setSuccessMsg(`อัปเดตข้อมูล ${editFormData.first_name} เรียบร้อย (Version + 1)`);
      setIsEditModalOpen(false);
      await fetchPatients();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถแก้ไขข้อมูลคนไข้ได้');
    } finally {
      setActionLoading(false);
    }
  };

  // Archive Patient
  const handleArchivePatient = async (p: PatientRecord) => {
    if (!window.confirm(`ยืนยันการยุติการดูแลและจัดเก็บถาวร (Archive) คนไข้ ${p.first_name} ${p.last_name}?`))
      return;
    try {
      setActionLoading(true);
      await defaultApiClient.patients.archive(p.id);
      setSuccessMsg(`ยุติการดูแลและจัดเก็บคนไข้ ${p.first_name} เรียบร้อย`);
      await fetchPatients();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถยุติการดูแลคนไข้ได้');
    } finally {
      setActionLoading(false);
    }
  };

  // Temporary Case Transfer
  const handleOpenTransfer = (p: PatientRecord) => {
    setSelectedPatient(p);
    setTransferFormData({
      to_pt_id: ptsList.find((pt) => pt.id !== currentUserId)?.id || '',
      reason: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    });
    setIsTransferModalOpen(true);
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !transferFormData.to_pt_id || !transferFormData.reason) {
      setErrorMsg('กรุณากรอกข้อมูลนักกายภาพปลายทางและเหตุผลการฝากเคส');
      return;
    }

    try {
      setActionLoading(true);
      await defaultApiClient.caseTransfers.create({
        patient_id: selectedPatient.id,
        to_pt_id: transferFormData.to_pt_id,
        reason: transferFormData.reason.trim(),
        start_date: transferFormData.start_date,
        end_date: transferFormData.end_date,
      });

      setSuccessMsg(`ส่งต่อเคส ${selectedPatient.first_name} ให้นักกายภาพปลายทางชั่วคราวเรียบร้อย`);
      setIsTransferModalOpen(false);
      await fetchPatients();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถส่งต่อเคสได้');
    } finally {
      setActionLoading(false);
    }
  };

  // PDPA Biometric Deletion
  const handleDeleteBiometrics = async (p: PatientRecord) => {
    if (
      !window.confirm(
        `ยืนยันการลบข้อมูลชีวมาตรใบหน้า (PDPA Biometric Erasure) ของคุณ ${p.first_name}? ไฟล์ 10 เฟรมและ Vector จะถูกลบทันที คนไข้จะต้องสแกนลงทะเบียนใหม่`
      )
    )
      return;

    try {
      setActionLoading(true);
      await defaultApiClient.patients.deleteFaceBiometrics(p.id);
      setSuccessMsg(`ลบข้อมูลชีวมาตรใบหน้าของคุณ ${p.first_name} สำเร็จ สถานะถูกรีเซ็ตเป็น awaiting_face`);
      await fetchPatients();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลบข้อมูลชีวมาตรได้');
    } finally {
      setActionLoading(false);
    }
  };

  const activeTransferredIds = new Set(
    delegatedTransfers
      .filter((t) => t.status === 'active' && t.to_pt_id === currentUserId)
      .map((t) => t.patient_id)
  );

  const filteredList = patients.filter((p) => {
    if (filterType === 'direct') return p.responsible_pt_id === currentUserId;
    if (filterType === 'transferred') return activeTransferredIds.has(p.id);
    return true;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-400" />
            <span>คนไข้ในความรับผิดชอบ (My Patients & Case Transfers)</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            เคสที่ท่านดูแลโดยตรงและเคสฝากชั่วคราว พร้อมระบบเวชระเบียนคลินิกและส่งต่อเคส
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPatients}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ-นามสกุล, HN, เบอร์โทร..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'all'
                ? 'bg-teal-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ทั้งหมด ({patients.length})
          </button>
          <button
            onClick={() => setFilterType('direct')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'direct'
                ? 'bg-teal-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            เคสดูแลตรง
          </button>
          <button
            onClick={() => setFilterType('transferred')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'transferred'
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            เคสฝากชั่วคราว ({activeTransferredIds.size})
          </button>
        </div>
      </div>

      {/* Patients Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">คนไข้ & รหัส HN</th>
                <th className="px-6 py-4">อายุ / เพศ / ติดต่อ</th>
                <th className="px-6 py-4">การวินิจฉัย / อาการ</th>
                <th className="px-6 py-4">สถานะชีวมาตร</th>
                <th className="px-6 py-4">ประเภทเคส</th>
                <th className="px-6 py-4 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    กำลังโหลดข้อมูลคนไข้...
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    ไม่พบคนไข้ในหมวดนี้
                  </td>
                </tr>
              ) : (
                filteredList.map((p) => {
                  const isDelegated = activeTransferredIds.has(p.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/50 transition">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">
                          {p.first_name} {p.last_name}
                        </div>
                        <div className="text-xs font-mono text-teal-400 mt-0.5">{p.hn}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-300">
                          อายุ {p.age} ปี • {p.sex === 'male' ? 'ชาย' : p.sex === 'female' ? 'หญิง' : 'อื่นๆ'}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{p.phone || 'ไม่ระบุเบอร์'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-300 max-w-xs truncate">
                          {p.injury || 'กายภาพบำบัดฟื้นฟูทั่วไป'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            p.registration_status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              p.registration_status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                          />
                          <span>{p.registration_status === 'active' ? 'ลงทะเบียนแล้ว' : 'รอสแกนหน้า'}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isDelegated ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                            <Clock className="w-3 h-3" />
                            <span>เคสฝากชั่วคราว</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            <span>ดูแลโดยตรง</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Open Clinical Records */}
                          <button
                            onClick={() => onOpenRecords(p)}
                            className="p-2 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition"
                            title="เปิดเวชระเบียน & โน้ตการรักษา"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit Demographics */}
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            title="แก้ไขข้อมูลทั่วไป"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          {/* Transfer Case */}
                          <button
                            onClick={() => handleOpenTransfer(p)}
                            className="p-2 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition"
                            title="ฝากเคสชั่วคราวให้นักกายภาพอื่น"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>

                          {/* PDPA Biometric Deletion */}
                          {p.registration_status === 'active' && (
                            <button
                              onClick={() => handleDeleteBiometrics(p)}
                              className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                              title="ลบข้อมูลชีวมาตรใบหน้า (PDPA)"
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                          )}

                          {/* Archive Case */}
                          <button
                            onClick={() => handleArchivePatient(p)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                            title="ยุติการดูแลและจัดเก็บถาวร"
                          >
                            <Archive className="w-4 h-4" />
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

      {/* Modal: Edit Patient */}
      {isEditModalOpen && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-teal-400" />
                <span>แก้ไขข้อมูลคนไข้ (HN: {selectedPatient.hn})</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePatient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ชื่อ</label>
                  <input
                    type="text"
                    required
                    value={editFormData.first_name}
                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">นามสกุล</label>
                  <input
                    type="text"
                    required
                    value={editFormData.last_name}
                    onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">อายุ (ปี)</label>
                  <input
                    type="number"
                    required
                    value={editFormData.age}
                    onChange={(e) => setEditFormData({ ...editFormData, age: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">เบอร์โทร</label>
                  <input
                    type="tel"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">การวินิจฉัย / อาการ</label>
                <input
                  type="text"
                  value={editFormData.injury}
                  onChange={(e) => setEditFormData({ ...editFormData, injury: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                <span>ระบบล็อกแบบ Optimistic Lock: Version ปัจจุบัน = {selectedPatient.version}</span>
                <Sparkles className="w-4 h-4 text-teal-400" />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20"
                >
                  {actionLoading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Case Transfer */}
      {isTransferModalOpen && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
                <span>ฝากเคสชั่วคราว (Temporary Transfer)</span>
              </h3>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm">
                <div className="font-semibold text-white">
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  HN: {selectedPatient.hn} • อาการ: {selectedPatient.injury || 'กายภาพทั่วไป'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  นักกายภาพปลายทางผู้รับฝาก
                </label>
                <select
                  required
                  value={transferFormData.to_pt_id}
                  onChange={(e) => setTransferFormData({ ...transferFormData, to_pt_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  <option value="">-- เลือกนักกายภาพบำบัด --</option>
                  {ptsList
                    .filter((pt) => pt.id !== currentUserId)
                    .map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.full_name} ({pt.pt_details?.license_no ? `วภ. ${pt.pt_details.license_no}` : pt.username})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ตั้งแต่วันที่</label>
                  <input
                    type="date"
                    required
                    value={transferFormData.start_date}
                    onChange={(e) => setTransferFormData({ ...transferFormData, start_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ถึงวันที่</label>
                  <input
                    type="date"
                    required
                    value={transferFormData.end_date}
                    onChange={(e) => setTransferFormData({ ...transferFormData, end_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">เหตุผลการฝากเคส</label>
                <input
                  type="text"
                  required
                  value={transferFormData.reason}
                  onChange={(e) => setTransferFormData({ ...transferFormData, reason: e.target.value })}
                  placeholder="เช่น ลาประชุมวิชาการ, ลาพักร้อน"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
                นักกายภาพปลายทางจะมีสิทธิ์เข้าถึงข้อมูลและเวชระเบียนของคนไข้ท่านนี้เฉพาะในช่วงเวลาที่ระบุเท่านั้น
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20"
                >
                  {actionLoading ? 'กำลังส่งต่อ...' : 'ยืนยันการฝากเคส'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
