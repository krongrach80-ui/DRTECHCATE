import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Plus,
  Clock,
  History,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  GitCommit,
  CornerDownRight
} from 'lucide-react';
import {
  PatientRecord,
  MedicalNoteRecord,
  TreatmentResultRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';

interface ClinicalRecordsViewProps {
  initialPatientId?: string;
}

export const ClinicalRecordsView: React.FC<ClinicalRecordsViewProps> = ({
  initialPatientId,
}) => {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [patientSearch, setPatientSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'notes' | 'results'>('notes');

  // Clinical data states
  const [notes, setNotes] = useState<MedicalNoteRecord[]>([]);
  const [treatmentResults, setTreatmentResults] = useState<TreatmentResultRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteBody, setNoteBody] = useState('');

  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [resultBody, setResultBody] = useState('');

  // Initial load: Fetch patient list
  useEffect(() => {
    const loadPatients = async () => {
      try {
        const list = await defaultApiClient.patients.list({ limit: 100 });
        setPatients(list);
        if (!selectedPatientId && list.length > 0) {
          setSelectedPatientId(list[0].id);
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดรายชื่อคนไข้ได้');
      }
    };
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch clinical records when selected patient changes
  const fetchRecords = async () => {
    if (!selectedPatientId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const [nList, rList] = await Promise.all([
        defaultApiClient.records.getNotes(selectedPatientId).catch(() => []),
        defaultApiClient.records.getTreatmentResults(selectedPatientId).catch(() => []),
      ]);
      setNotes(nList);
      setTreatmentResults(rList);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดเวชระเบียนคนไข้ได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId]);

  // Create Append-Only Medical Note
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !noteBody.trim()) {
      setErrorMsg('กรุณากรอกข้อความบันทึกเวชระเบียน');
      return;
    }

    try {
      setActionLoading(true);
      await defaultApiClient.records.createNote(selectedPatientId, noteBody.trim());
      setSuccessMsg('บันทึกเวชระเบียนต่อท้าย (Append-Only) สำเร็จ ข้อมูลได้รับการปกป้องโดยระบบฐานข้อมูล');
      setNoteBody('');
      setIsNoteModalOpen(false);
      await fetchRecords();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถสร้างบันทึกเวชระเบียนได้');
    } finally {
      setActionLoading(false);
    }
  };

  // Create Versioned Treatment Result
  const handleCreateTreatmentResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !resultBody.trim()) {
      setErrorMsg('กรุณากรอกรายละเอียดผลการประเมินการรักษา');
      return;
    }

    try {
      setActionLoading(true);
      await defaultApiClient.records.createTreatmentResult(selectedPatientId, resultBody.trim());
      setSuccessMsg('บันทึกผลการรักษาเป็นเวอร์ชันใหม่เรียบร้อย (Versioned Record)');
      setResultBody('');
      setIsResultModalOpen(false);
      await fetchRecords();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกผลการรักษาได้');
    } finally {
      setActionLoading(false);
    }
  };

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  const filteredPatients = patients.filter(
    (p) =>
      p.first_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.last_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.hn.toLowerCase().includes(patientSearch.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-600" />
            <span>เวชระเบียนคลินิกกายภาพบำบัด (Clinical Records)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            บันทึกโน้ตต่อท้าย (Append-Only) และผลการรักษาแบบเวอร์ชัน (Versioned) ปราศจากปุ่มลบหรือแก้ไข
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchRecords}
            disabled={!selectedPatientId || loading}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="รีเฟรชเวชระเบียน"
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

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Patient Selection Column (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              เลือกคนไข้เพื่อดูเวชระเบียน
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ, HN..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="divide-y divide-slate-800/80 max-h-[550px] overflow-y-auto space-y-1">
              {filteredPatients.map((p) => {
                const isSelected = p.id === selectedPatientId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    className={`w-full text-left p-3 rounded-xl transition ${
                      isSelected
                        ? 'bg-teal-500/20 border border-teal-500/40 text-white'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <div className="font-semibold text-sm">
                      {p.first_name} {p.last_name}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center justify-between mt-1">
                      <span className="font-mono text-teal-400">{p.hn}</span>
                      <span>อายุ {p.age} ปี</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Clinical Records Details (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {selectedPatient ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              {/* Patient Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {selectedPatient.first_name} {selectedPatient.last_name}
                  </h3>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                    <span className="font-mono text-teal-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      HN: {selectedPatient.hn}
                    </span>
                    <span>อายุ {selectedPatient.age} ปี</span>
                    <span>อาการ: {selectedPatient.injury || 'กายภาพบำบัดทั่วไป'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeTab === 'notes' ? (
                    <button
                      onClick={() => setIsNoteModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-xs font-semibold shadow-lg shadow-teal-500/20 transition"
                    >
                      <Plus className="w-4 h-4" />
                      <span>เขียนโน้ตต่อท้าย</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsResultModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 transition"
                    >
                      <Plus className="w-4 h-4" />
                      <span>บันทึกผลรักษาเวอร์ชันใหม่</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Invariant Warning Banner */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 text-xs text-slate-400 flex items-center gap-3">
                <ShieldAlert className="w-4 h-4 text-teal-400 flex-shrink-0" />
                <span>
                  ตามระเบียบมาตรฐานเวชระเบียนทางการแพทย์ (Section 9): ข้อมูลทั้งหมดเป็นแบบต่อท้าย (Append-Only)
                  ห้ามแก้ไขหรือลบย้อนหลังทุกกรณี ฝั่งฐานข้อมูลมี Database Trigger คอยป้องกันการ UPDATE/DELETE
                </span>
              </div>

              {/* Tab Selector */}
              <div className="flex items-center border-b border-slate-800">
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`pb-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
                    activeTab === 'notes'
                      ? 'border-teal-400 text-teal-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>บันทึกความคืบหน้า (Medical Notes) ({notes.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('results')}
                  className={`pb-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
                    activeTab === 'results'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>ประวัติผลการรักษา (Treatment Results) ({treatmentResults.length})</span>
                </button>
              </div>

              {/* Tab 1: Medical Notes (Append-Only) */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  {loading ? (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      กำลังโหลดบันทึกเวชระเบียน...
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      ยังไม่มีบันทึกเวชระเบียนสำหรับคนไข้ท่านนี้
                    </div>
                  ) : (
                    notes.map((n, idx) => (
                      <div
                        key={n.id || idx}
                        className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2 relative"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800/60">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-300">
                              {n.author?.full_name || 'นักกายภาพบำบัด'}
                            </span>
                            <span className="text-slate-500">•</span>
                            <span className="font-mono text-teal-400">
                              {new Date(n.created_at).toLocaleString('th-TH')}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
                            #NOTE-{idx + 1}
                          </span>
                        </div>
                        <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed pt-1">
                          {n.body}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 2: Treatment Results (Versioned History) */}
              {activeTab === 'results' && (
                <div className="space-y-4">
                  {loading ? (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      กำลังโหลดประวัติผลการรักษา...
                    </div>
                  ) : treatmentResults.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      ยังไม่มีบันทึกผลการรักษาสำหรับคนไข้ท่านนี้
                    </div>
                  ) : (
                    treatmentResults.map((tr, idx) => (
                      <div
                        key={tr.id || idx}
                        className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800/60">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                              <GitCommit className="w-3.5 h-3.5" />
                              <span>เวอร์ชัน {tr.version}</span>
                            </span>
                            <span className="text-slate-500">•</span>
                            <span className="font-semibold text-slate-300">
                              {tr.author?.full_name || 'นักกายภาพบำบัด'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span className="font-mono text-slate-400">
                              {new Date(tr.created_at).toLocaleString('th-TH')}
                            </span>
                          </div>
                        </div>

                        {tr.supersedes_id && (
                          <div className="text-[11px] text-cyan-400/80 flex items-center gap-1 font-mono">
                            <CornerDownRight className="w-3 h-3" />
                            <span>อัปเดตแทนที่เวอร์ชันก่อนหน้า (Supersedes ID: {tr.supersedes_id.slice(0, 8)}...)</span>
                          </div>
                        )}

                        <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed pt-1">
                          {tr.body}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
              กรุณาเลือกคนไข้จากรายการทางด้านซ้ายเพื่อเปิดดูเวชระเบียน
            </div>
          )}
        </div>
      </div>

      {/* Modal: Add Note */}
      {isNoteModalOpen && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-400" />
                <span>เขียนโน้ตเวชระเบียนต่อท้าย (Append-Only Note)</span>
              </h3>
              <button
                onClick={() => setIsNoteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="space-y-4">
              <div className="text-xs text-slate-400">
                คนไข้: <span className="font-semibold text-white">{selectedPatient.first_name} {selectedPatient.last_name}</span> (HN: {selectedPatient.hn})
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  ข้อความบันทึกความคืบหน้า / การรักษา
                </label>
                <textarea
                  required
                  rows={6}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="เช่น ผู้ป่วยมีอาการปวดกล้ามเนื้อต้นขาลดลง (VAS 4/10 -> 2/10) หลังฝึกท่า Bridge ต่อเนื่อง 3 เซ็ต แนะนำให้ฝึกต่อเนื่องสัปดาห์ละ 3 ครั้ง..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-300">
                เมื่อบันทึกแล้ว ข้อความนี้จะถูกจัดเก็บแบบถาวรและไม่สามารถแก้ไขได้ เพื่อความโปร่งใสตามมาตรฐานเวชระเบียนคลินิก
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20"
                >
                  {actionLoading ? 'กำลังบันทึก...' : 'บันทึกโน้ต'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Treatment Result */}
      {isResultModalOpen && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <GitCommit className="w-5 h-5 text-cyan-400" />
                <span>บันทึกผลการรักษา (Versioned Result)</span>
              </h3>
              <button
                onClick={() => setIsResultModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTreatmentResult} className="space-y-4">
              <div className="text-xs text-slate-400">
                คนไข้: <span className="font-semibold text-white">{selectedPatient.first_name} {selectedPatient.last_name}</span> (HN: {selectedPatient.hn})
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  ผลการประเมินและการรักษา (เวอร์ชันถัดไป)
                </label>
                <textarea
                  required
                  rows={6}
                  value={resultBody}
                  onChange={(e) => setResultBody(e.target.value)}
                  placeholder="สรุปผลการฟื้นฟูสมรรถภาพ, การเคลื่อนไหวของข้อต่อ (ROM), ความแข็งแรงของกล้ามเนื้อ (MMT) และแผนการรักษาขั้นต่อไป..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
                การบันทึกครั้งนี้จะสร้างเวอร์ชันใหม่ขึ้นมาโดยอัตโนมัติ และชี้โยงไปยังเวอร์ชันก่อนหน้าเพื่อเก็บประวัติการรักษาทั้งหมดไว้อย่างครบถ้วน
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsResultModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm transition shadow-lg shadow-cyan-600/20"
                >
                  {actionLoading ? 'กำลังบันทึก...' : 'บันทึกเวอร์ชันใหม่'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
