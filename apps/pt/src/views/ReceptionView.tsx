import React, { useState, useEffect } from 'react';
import {
  Search,
  UserPlus,
  Send,
  UserCheck,
  AlertTriangle,
  BellRing,
  Clock,
  CheckCircle2,
  X,
  RefreshCw,
  Monitor,
  Activity,
  Check,
  Users
} from 'lucide-react';
import {
  PatientRecord,
  TodayCourseItem,
  KioskRecord,
  StaffCallRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';

interface ReceptionViewProps {
  staffCalls: StaffCallRecord[];
  onStaffCallHandled: () => void;
  currentUserId: string;
}

const DEMO_PATIENTS: PatientRecord[] = [];

const DEMO_TODAY_QUEUE: TodayCourseItem[] = [
  {
    id: 'today-01',
    course_id: 'c-01',
    patient_id: 'P-1001',
    patient: DEMO_PATIENTS[0],
    start_time: '09:00 - 10:00',
    kiosk_id: 'kiosk-01',
    kiosk_name: 'ตู้ Kiosk 01 (Main Hall)',
    modpack_id: 'mp-01',
    modpack_title: 'โปรแกรมฟื้นฟูข้อไหล่ติด (Adhesive Capsulitis)',
    include_minigame: true,
    mission_status: 'not_started',
  },
];

const DEMO_KIOSKS: KioskRecord[] = [
  {
    id: 'kiosk-01',
    name: 'ตู้ Kiosk อาคารกายภาพบำบัด ชั้น 1 (Main Hall)',
    location: 'แผนกเวชศาสตร์ฟื้นฟู ชั้น 1',
    is_active: true,
    paired_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

export const ReceptionView: React.FC<ReceptionViewProps> = ({
  staffCalls,
  onStaffCallHandled,
  currentUserId,
}) => {
  // States
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<PatientRecord[]>(DEMO_PATIENTS);
  const [todayQueue, setTodayQueue] = useState<TodayCourseItem[]>(DEMO_TODAY_QUEUE);
  const [kiosks, setKiosks] = useState<KioskRecord[]>(DEMO_KIOSKS);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [selectedPatientForKiosk, setSelectedPatientForKiosk] = useState<PatientRecord | null>(null);
  const [selectedKioskId, setSelectedKioskId] = useState('');
  const [ticketCountdown, setTicketCountdown] = useState<number | null>(null);

  // Patient Creation Form
  const [patientForm, setPatientForm] = useState({
    first_name: '',
    last_name: '',
    age: '',
    sex: 'male' as 'male' | 'female' | 'other',
    phone: '',
    injury: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [pts, today, kList] = await Promise.all([
        defaultApiClient.patients.list({ q: search.trim() || undefined, limit: 50 }).catch(() => []),
        defaultApiClient.courses.getToday().catch(() => []),
        defaultApiClient.kiosk.listDevices().catch(() => []),
      ]);
      const safePts = Array.isArray(pts) && pts.length > 0 ? pts : (search.trim() ? [] : DEMO_PATIENTS);
      const safeToday = Array.isArray(today) && today.length > 0 ? today : DEMO_TODAY_QUEUE;
      const safeKiosks = Array.isArray(kList) && kList.length > 0 ? kList : DEMO_KIOSKS;
      setPatients(safePts);
      setTodayQueue(safeToday);
      setKiosks(safeKiosks);
    } catch {
      if (!search.trim()) {
        setPatients(DEMO_PATIENTS);
        setTodayQueue(DEMO_TODAY_QUEUE);
        setKiosks(DEMO_KIOSKS);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Ticket countdown
  useEffect(() => {
    if (ticketCountdown === null || ticketCountdown <= 0) return;
    const timer = setInterval(() => {
      setTicketCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [ticketCountdown]);

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientForm.first_name.trim() || !patientForm.last_name.trim() || !patientForm.age) {
      setErrorMsg('กรุณากรอกชื่อ นามสกุล และอายุของคนไข้');
      return;
    }

    try {
      setActionLoading(true);
      const newPt = await defaultApiClient.patients.create({
        first_name: patientForm.first_name.trim(),
        last_name: patientForm.last_name.trim(),
        age: parseInt(patientForm.age, 10),
        sex: patientForm.sex,
        phone: patientForm.phone.trim() || undefined,
        injury: patientForm.injury.trim() || undefined,
        responsible_pt_id: currentUserId,
      });

      setSuccessMsg(`สร้างเวชระเบียนใหม่ ${newPt.first_name} ${newPt.last_name} (HN: ${newPt.hn}) เรียบร้อย`);
      setIsCreateModalOpen(false);
      setPatientForm({
        first_name: '',
        last_name: '',
        age: '',
        sex: 'male',
        phone: '',
        injury: '',
      });
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างคนไข้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckin = async (patient: PatientRecord) => {
    try {
      setActionLoading(true);
      await defaultApiClient.patients.checkin(patient.id);
      setSuccessMsg(`เช็คอินคุณ ${patient.first_name} เข้ากลุ่มเทียบใบหน้าประจำวันนี้เรียบร้อย`);
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถเช็คอินคนไข้ได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenSendToKiosk = (patient: PatientRecord) => {
    setSelectedPatientForKiosk(patient);
    setSelectedKioskId(kiosks.length > 0 ? kiosks[0].id : '');
    setIsSendModalOpen(true);
  };

  const handleSendToKiosk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientForKiosk) return;

    try {
      setActionLoading(true);
      await defaultApiClient.patients.sendToKiosk(
        selectedPatientForKiosk.id,
        selectedKioskId || undefined
      );

      setTicketCountdown(600); // 10 minutes
      setSuccessMsg(
        `ส่ง ${selectedPatientForKiosk.first_name} ไปลงทะเบียนหน้าที่ตู้เรียบร้อย ตั๋วมีอายุ 10 นาที ตู้จะเข้าโหมดสแกน 10 ท่าอัตโนมัติ`
      );
      setIsSendModalOpen(false);
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถส่งไปลงทะเบียนที่ตู้ได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveStaffCall = async (id: string) => {
    try {
      setActionLoading(true);
      await defaultApiClient.kiosk.handleStaffCall(id);
      setSuccessMsg('รับเรื่องและบันทึกการช่วยเหลือคนไข้เรียบร้อย');
      onStaffCallHandled();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถรับเรื่องได้');
    } finally {
      setActionLoading(false);
    }
  };

  const unhandledCalls = staffCalls.filter((c) => !c.handled_at);

  return (
    <div className="p-8 space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Monitor className="w-6 h-6 text-teal-600" />
            <span>หน้าต้อนรับ & คิวฝึกสด (Reception Desk)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            ค้นหาคนไข้, เช็คอินเข้ากลุ่มเทียบใบหน้า, ออกตั๋วส่งไปลงทะเบียนตู้ 10 นาที และติดตามสถานะฝึกสด
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-medium text-sm shadow-lg shadow-teal-500/20 transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>สร้างคนไข้ใหม่</span>
          </button>
        </div>
      </div>

      {/* Emergency Staff Calls Active Banner */}
      {unhandledCalls.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 space-y-3 shadow-lg shadow-rose-950/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-rose-300">
              <BellRing className="w-5 h-5 text-rose-400 animate-bounce" />
              <span>คำเรียกเจ้าหน้าที่ฉุกเฉินจากตู้ Kiosk ({unhandledCalls.length} รายการ)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unhandledCalls.map((call) => (
              <div
                key={call.id}
                className="p-3.5 rounded-xl bg-slate-900/90 border border-rose-500/30 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-semibold text-rose-300">
                    ตู้ ID: {call.kiosk_id ? call.kiosk_id.slice(0, 8) : 'Kiosk'}
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">{call.reason}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-1">
                    {new Date(call.created_at).toLocaleTimeString('th-TH')}
                  </div>
                </div>
                <button
                  onClick={() => handleResolveStaffCall(call.id)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>รับเรื่อง</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Kiosk Ticket Countdown Banner */}
      {ticketCountdown !== null && ticketCountdown > 0 && (
        <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-teal-400 animate-spin" />
            <div>
              <span className="font-semibold text-white">ตั๋วลงทะเบียนหน้าที่ตู้กำลังทำงาน: </span>
              <span>เหลือเวลา {Math.floor(ticketCountdown / 60)} นาที {ticketCountdown % 60} วินาที</span>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-300 font-mono">
            หมดอายุ 10 นาที
          </span>
        </div>
      )}

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

      {/* 2-Column Grid: Left = Patient Search & Checkin, Right = Today Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Quick Patient Intake & Kiosk Dispatch (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-400" />
                <span>ค้นหาคนไข้ & ดำเนินการต้อนรับ</span>
              </h3>
              <span className="text-xs text-slate-400">พบ {patients.length} รายการ</span>
            </div>

            {/* Trigram Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ-นามสกุลไทย, HN, เบอร์โทร..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Patients List */}
            <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-500 text-sm">กำลังโหลดรายชื่อคนไข้...</div>
              ) : patients.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  {search ? 'ไม่พบคนไข้ที่ตรงกับคำค้นหา' : 'ไม่มีรายการคนไข้'}
                </div>
              ) : (
                patients.map((p) => (
                  <div
                    key={p.id}
                    className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/40 rounded-xl transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 text-sm">
                          {p.first_name} {p.last_name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-teal-400 border border-slate-700">
                          {p.hn}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            p.registration_status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {p.registration_status === 'active' ? 'ใบหน้าพร้อม' : 'รอลงทะเบียนหน้า'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        อายุ {p.age} ปี • {p.phone || 'ไม่ระบุเบอร์'} • {p.injury || 'กายภาพทั่วไป'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Check-in button */}
                      <button
                        onClick={() => handleCheckin(p)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-teal-600 hover:text-white text-slate-300 text-xs font-medium transition flex items-center gap-1.5"
                        title="เช็คอินเข้ากลุ่มเทียบใบหน้าประจำวัน"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-teal-400" />
                        <span>เช็คอิน</span>
                      </button>

                      {/* Send to Kiosk button */}
                      <button
                        onClick={() => handleOpenSendToKiosk(p)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 text-xs font-medium transition flex items-center gap-1.5"
                        title="ออกตั๋วส่งไปลงทะเบียนหน้าที่ตู้ 10 นาที"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>ส่งไปตู้</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Today's Realtime Queue & Mission Status (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                <span>คิวฝึกประจำวัน ({todayQueue.length} รายการ)</span>
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                {new Date().toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
              {todayQueue.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  ไม่มีนัดหมายกายภาพในวันนี้
                </div>
              ) : (
                todayQueue.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-slate-200 text-sm">
                        {item.patient?.first_name} {item.patient?.last_name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        HN: {item.patient?.hn} • เวลา {item.start_time || 'ตามกำหนด'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {item.kiosk_name ? `ตู้: ${item.kiosk_name}` : 'ทุกตู้'} • {item.modpack_title || 'ชุดท่าเฉพาะบุคคล'}
                      </div>
                    </div>

                    <div>
                      {item.mission_status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>ฝึกเสร็จแล้ว</span>
                        </span>
                      ) : item.mission_status === 'in_progress' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                          <Clock className="w-3 h-3 animate-spin" />
                          <span>กำลังฝึก</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
                          <span>ยังไม่มา</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create Patient */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-teal-400" />
                <span>สร้างเวชระเบียนคนไข้ใหม่</span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePatient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ชื่อ</label>
                  <input
                    type="text"
                    required
                    value={patientForm.first_name}
                    onChange={(e) => setPatientForm({ ...patientForm, first_name: e.target.value })}
                    placeholder="กิตติ"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">นามสกุล</label>
                  <input
                    type="text"
                    required
                    value={patientForm.last_name}
                    onChange={(e) => setPatientForm({ ...patientForm, last_name: e.target.value })}
                    placeholder="ใจดี"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">อายุ (ปี)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={120}
                    value={patientForm.age}
                    onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })}
                    placeholder="45"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">เพศ</label>
                  <select
                    value={patientForm.sex}
                    onChange={(e) => setPatientForm({ ...patientForm, sex: e.target.value as 'male' | 'female' | 'other' })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="male">ชาย</option>
                    <option value="female">หญิง</option>
                    <option value="other">อื่นๆ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">เบอร์โทร</label>
                  <input
                    type="tel"
                    value={patientForm.phone}
                    onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                    placeholder="0812345678"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">การวินิจฉัย / อาการบาดเจ็บ</label>
                <input
                  type="text"
                  value={patientForm.injury}
                  onChange={(e) => setPatientForm({ ...patientForm, injury: e.target.value })}
                  placeholder="เช่น ปวดหลังส่วนล่างเรื้อรัง (LBP)"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-300">
                ระบบจะสร้างรหัส HN อัตโนมัติ (เช่น HN100001) และกำหนดสถานะเป็น awaiting_face เพื่อเตรียมส่งลงทะเบียนใบหน้าที่ตู้ Kiosk
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20"
                >
                  {actionLoading ? 'กำลังสร้าง...' : 'บันทึกคนไข้'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Send to Kiosk */}
      {isSendModalOpen && selectedPatientForKiosk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-teal-400" />
                <span>ส่งคนไข้ไปลงทะเบียนหน้าที่ตู้</span>
              </h3>
              <button
                onClick={() => setIsSendModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendToKiosk} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm">
                <div className="font-semibold text-white">
                  {selectedPatientForKiosk.first_name} {selectedPatientForKiosk.last_name}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  HN: {selectedPatientForKiosk.hn} • อายุ {selectedPatientForKiosk.age} ปี
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  เลือกตู้ Kiosk ปลายทาง
                </label>
                <select
                  value={selectedKioskId}
                  onChange={(e) => setSelectedKioskId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  <option value="">ทุกตู้ Kiosk ในโรงพยาบาล</option>
                  {kiosks.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.location || 'ไม่ระบุตำแหน่ง'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                เมื่อกดส่ง ตั๋ว enrollment_ticket (หมดอายุ 10 นาที) จะถูกส่งเข้าตู้ Kiosk แบบเรียลไทม์ และคนไข้สามารถเดินไปยืนหน้าตู้เพื่อสแกนใบหน้า 10 ท่าได้ทันทีโดยไม่ต้องเลือกชื่อตนเอง
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSendModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-medium text-sm transition shadow-lg shadow-teal-500/20"
                >
                  {actionLoading ? 'กำลังส่งตั๋ว...' : 'ยืนยันส่งไปตู้'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
