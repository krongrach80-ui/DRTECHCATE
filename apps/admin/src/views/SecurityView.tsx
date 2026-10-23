import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Bell,
  UserX,
  Ban,
  Monitor,
  KeyRound,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Clock,
  History,
  Check,
  Plus
} from 'lucide-react';
import {
  AuditRecord,
  BanRecord,
  KioskRecord,
  StaffCallRecord,
  UserProfile,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';

interface SecurityViewProps {
  staffCalls: StaffCallRecord[];
  onStaffCallHandled: () => void;
  sseConnected?: boolean;
}

export const SecurityView: React.FC<SecurityViewProps> = ({
  staffCalls,
  onStaffCallHandled,
  sseConnected = false,
}) => {
  const [subTab, setSubTab] = useState<'calls' | 'audit' | 'bans' | 'kiosks' | 'sessions'>('calls');
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [kiosks, setKiosks] = useState<KioskRecord[]>([]);
  const [staffUsers, setStaffUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Pairing code generator state
  const [pairingModalKiosk, setPairingModalKiosk] = useState<KioskRecord | null>(null);
  const [pairingCodeResult, setPairingCodeResult] = useState<{ code: string; expiresIn: number } | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Create Ban Modal
  const [isBanModalOpen, setIsBanModalOpen] = useState<boolean>(false);
  const [banFormData, setBanFormData] = useState({
    type: 'ip' as 'ip' | 'device' | 'account',
    value: '',
    reason: '',
    expires_at: '',
  });

  // Create Kiosk Modal
  const [isKioskModalOpen, setIsKioskModalOpen] = useState<boolean>(false);
  const [kioskFormData, setKioskFormData] = useState({
    name: '',
    location: '',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchSecurityData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [audits, bList, kList, sList] = await Promise.all([
        defaultApiClient.audit.list({ limit: 50 }).catch(() => []),
        defaultApiClient.security.listBans().catch(() => []),
        defaultApiClient.kiosk.listDevices().catch(() => []),
        defaultApiClient.staff.list().catch(() => []),
      ]);
      setAuditLogs(audits);
      setBans(bList);
      setKiosks(kList);
      setStaffUsers(sList);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลความปลอดภัยได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  // 10-Minute Countdown timer for generated pairing code
  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

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

  const handleForceLogoutUser = async (userId: string, name: string) => {
    if (!window.confirm(`ยืนยันการเตะออกจากระบบ (Force Logout) สำหรับ ${name}? ทุกเซสชันจะถูกตัดทันที`))
      return;
    try {
      setActionLoading(true);
      await defaultApiClient.security.forceLogout(userId, 'บังคับตัดเซสชันโดยผู้อำนวยการ');
      setSuccessMsg(`บังคับออกจากระบบ ${name} เรียบร้อยแล้ว`);
      await fetchSecurityData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบังคับออกจากระบบได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banFormData.value.trim() || !banFormData.reason.trim()) {
      setErrorMsg('กรุณากรอกข้อมูลเป้าหมายและเหตุผลการแบน');
      return;
    }

    try {
      setActionLoading(true);
      await defaultApiClient.security.createBan({
        type: banFormData.type,
        value: banFormData.value.trim(),
        reason: banFormData.reason.trim(),
        expires_at: banFormData.expires_at || undefined,
      });
      setSuccessMsg(`บันทึกคำสั่งแบน ${banFormData.value} มีผลทันที`);
      setIsBanModalOpen(false);
      setBanFormData({ type: 'ip', value: '', reason: '', expires_at: '' });
      await fetchSecurityData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถสร้างคำสั่งแบนได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeBan = async (id: string, value: string) => {
    if (!window.confirm(`ยืนยันการยกเลิกแบน ${value}?`)) return;
    try {
      setActionLoading(true);
      await defaultApiClient.security.revokeBan(id);
      setSuccessMsg(`ยกเลิกการแบน ${value} เรียบร้อย`);
      await fetchSecurityData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถยกเลิกแบนได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGeneratePairingCode = async (kiosk: KioskRecord) => {
    setPairingModalKiosk(kiosk);
    setPairingCodeResult(null);
    try {
      setActionLoading(true);
      const res = await defaultApiClient.kiosk.createPairCode(kiosk.id);
      setPairingCodeResult({ code: res.pairing_code, expiresIn: res.expires_in_seconds });
      setCountdown(res.expires_in_seconds || 600);
      setSuccessMsg(`ออกรหัสจับคู่สำหรับตู้ ${kiosk.name} สำเร็จ รหัสมีอายุ 10 นาที`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถสร้างรหัสจับคู่ตู้ได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateKiosk = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      await defaultApiClient.kiosk.createDevice(kioskFormData);
      setSuccessMsg(`ลงทะเบียนตู้ Kiosk ใหม่ "${kioskFormData.name}" เรียบร้อย`);
      setIsKioskModalOpen(false);
      setKioskFormData({ name: '', location: '' });
      await fetchSecurityData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลงทะเบียนตู้ได้');
    } finally {
      setActionLoading(false);
    }
  };

  const unhandledCalls = staffCalls.filter((c) => !c.handled_at);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
            <span>ประวัติและความปลอดภัย (Audit, Bans & Security)</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            คำเรียกเจ้าหน้าที่ฉุกเฉิน (SSE), บันทึก Audit Log, บังคับตัดเซสชัน, ระบบแบน และจัดการตู้ Kiosk
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              sseConnected
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                sseConnected ? 'bg-teal-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{sseConnected ? 'Realtime Connected' : 'Connecting SSE...'}</span>
          </div>
          <button
            onClick={fetchSecurityData}
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

      {/* LIVE EMERGENCY BANNER (If unhandled staff calls exist) */}
      {unhandledCalls.length > 0 && (
        <div className="p-5 rounded-3xl bg-rose-600/20 border-2 border-rose-500 text-white flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse shadow-xl shadow-rose-950/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
              <Bell className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-rose-200">
                มีคนไข้ต้องการความช่วยเหลือที่ตู้ Kiosk ({unhandledCalls.length} รายการ)!
              </h3>
              <p className="text-xs text-rose-300 mt-0.5">
                เกิดจากสแกนหน้าไม่ผ่านครบ 3 ครั้ง หรือคนไข้กดปุ่มเรียกเจ้าหน้าที่บนหน้าจอ
              </p>
            </div>
          </div>

          <button
            onClick={() => setSubTab('calls')}
            className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold shadow-lg"
          >
            ดูรายการเรียกเจ้าหน้าที่ทันที
          </button>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setSubTab('calls')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            subTab === 'calls'
              ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>คำเรียกเจ้าหน้าที่ ({unhandledCalls.length})</span>
        </button>

        <button
          onClick={() => setSubTab('audit')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            subTab === 'audit'
              ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <History className="w-4 h-4" />
          <span>บันทึก Audit Logs ({auditLogs.length})</span>
        </button>

        <button
          onClick={() => setSubTab('sessions')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            subTab === 'sessions'
              ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <UserX className="w-4 h-4" />
          <span>เซสชันและการเตะออก (Force Logout)</span>
        </button>

        <button
          onClick={() => setSubTab('bans')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            subTab === 'bans'
              ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Ban className="w-4 h-4" />
          <span>จัดการการแบน (Bans Manager)</span>
        </button>

        <button
          onClick={() => setSubTab('kiosks')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            subTab === 'kiosks'
              ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span>อุปกรณ์ตู้ Kiosk ({kiosks.length})</span>
        </button>
      </div>

      {/* SUB-TAB 1: STAFF CALLS */}
      {subTab === 'calls' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-white text-base">รายการคำขอความช่วยเหลือจากตู้ Kiosk</h3>
            <span className="text-xs text-slate-400">อัปเดตสดอัตโนมัติผ่าน Real-time SSE</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">เวลาแจ้ง</th>
                  <th className="px-6 py-4 font-semibold">ตู้ Kiosk</th>
                  <th className="px-6 py-4 font-semibold">สาเหตุ</th>
                  <th className="px-6 py-4 font-semibold">สถานะ</th>
                  <th className="px-6 py-4 font-semibold text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {staffCalls.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      ไม่มีประวัติคำเรียกเจ้าหน้าที่
                    </td>
                  </tr>
                ) : (
                  staffCalls.map((call) => (
                    <tr key={call.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {new Date(call.created_at).toLocaleString('th-TH')}
                      </td>
                      <td className="px-6 py-4 font-bold text-white">{call.kiosk_id}</td>
                      <td className="px-6 py-4 text-xs text-rose-300 font-medium">{call.reason}</td>
                      <td className="px-6 py-4">
                        {call.handled_at ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <Check className="w-3 h-3" />
                            <span>ช่วยเหลือแล้ว</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 animate-pulse">
                            <Bell className="w-3 h-3" />
                            <span>รอดำเนินการ</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {!call.handled_at && (
                          <button
                            onClick={() => handleResolveStaffCall(call.id)}
                            disabled={actionLoading}
                            className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md shadow-teal-950/40"
                          >
                            รับเรื่องช่วยเหลือ
                          </button>
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

      {/* SUB-TAB 2: AUDIT LOGS */}
      {subTab === 'audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-white text-base">บันทึกเหตุการณ์ Audit Trail (Insert-Only)</h3>
            <span className="text-xs text-slate-400">ตามมาตรฐาน PDPA บันทึกทั้งการอ่านและการเขียน</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">เวลา</th>
                  <th className="px-6 py-4 font-semibold">ผู้กระทำ (Actor)</th>
                  <th className="px-6 py-4 font-semibold">การกระทำ (Action)</th>
                  <th className="px-6 py-4 font-semibold">เป้าหมาย (Entity)</th>
                  <th className="px-6 py-4 font-semibold">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-sans">
                      ยังไม่มีรายการ Audit Log
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-3 text-slate-400">
                        {new Date(log.created_at).toLocaleString('th-TH')}
                      </td>
                      <td className="px-6 py-3 text-white">
                        {log.actor_type}: {log.actor_id?.slice(0, 8) || 'system'}
                      </td>
                      <td className="px-6 py-3 text-teal-400 font-semibold">{log.action}</td>
                      <td className="px-6 py-3 text-slate-300">
                        {log.entity} ({log.entity_id?.slice(0, 8) || '-'})
                      </td>
                      <td className="px-6 py-3 text-slate-400">{log.ip || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SESSIONS & FORCE LOGOUT */}
      {subTab === 'sessions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-6 space-y-4">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="font-bold text-white text-base">เซสชันเจ้าหน้าที่และการบังคับออกจากระบบ</h3>
            <p className="text-xs text-slate-400 mt-1">
              คำสั่ง Force Logout จะปรับ `force_logout_at` ใน DB ทำให้ token เดิมไม่สามารถใช้ผ่าน API ได้ทันที
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {staffUsers.map((user) => (
              <div
                key={user.id}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-white text-sm">{user.full_name}</div>
                  <div className="text-xs text-slate-400">@{user.username} • {user.role}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    ล็อกอินล่าสุด:{' '}
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleString('th-TH')
                      : 'ยังไม่เคยล็อกอิน'}
                  </div>
                </div>

                <button
                  onClick={() => handleForceLogoutUser(user.id, user.full_name)}
                  className="px-4 py-2 rounded-xl bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 text-xs font-semibold"
                >
                  เตะออก (Force Logout)
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: BANS */}
      {subTab === 'bans' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-white text-base">จัดการรายการแบน (IP / Device / Account)</h3>
              <p className="text-xs text-slate-400 mt-1">
                มีระบบป้องกัน (Allowlist) ไม่ให้สั่งแบน IP ของโรงพยาบาลหรือ NAT โดยเด็ดขาด
              </p>
            </div>
            <button
              onClick={() => setIsBanModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>สร้างคำสั่งแบน</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">ประเภท</th>
                  <th className="px-6 py-4 font-semibold">ค่าเป้าหมาย (Value)</th>
                  <th className="px-6 py-4 font-semibold">เหตุผล</th>
                  <th className="px-6 py-4 font-semibold">วันหมดอายุ</th>
                  <th className="px-6 py-4 font-semibold text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {bans.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-sans">
                      ไม่มีรายการแบนที่เปิดใช้งานอยู่
                    </td>
                  </tr>
                ) : (
                  bans.map((ban) => (
                    <tr key={ban.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4 text-teal-400 uppercase font-bold">{ban.type}</td>
                      <td className="px-6 py-4 text-white font-bold">{ban.value}</td>
                      <td className="px-6 py-4 text-slate-300 font-sans">{ban.reason}</td>
                      <td className="px-6 py-4 text-slate-400">
                        {ban.expires_at ? new Date(ban.expires_at).toLocaleDateString('th-TH') : 'ถาวร'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleRevokeBan(ban.id, ban.value)}
                          className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-sans"
                        >
                          ยกเลิกแบน
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: KIOSKS & PAIRING */}
      {subTab === 'kiosks' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-white text-base">อุปกรณ์ตู้ Kiosk ประจำโรงพยาบาล</h3>
              <p className="text-xs text-slate-400 mt-1">
                การผูกอุปกรณ์ตู้ทำด้วยรหัสจับคู่ 1 ครั้ง (Single-use, หมดอายุ 10 นาที) เก็บเฉพาะ HMAC-SHA256 ใน DB
              </p>
            </div>
            <button
              onClick={() => setIsKioskModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>ลงทะเบียนตู้ใหม่</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {kiosks.map((k) => (
              <div
                key={k.id}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="font-bold text-white text-base flex items-center gap-2">
                      <Monitor className="w-5 h-5 text-teal-400" />
                      <span>{k.name}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        k.is_active
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                      }`}
                    >
                      {k.is_active ? 'จับคู่แล้ว' : 'ยังไม่จับคู่'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    สถานที่ติดตั้ง: {k.location || 'ชั้น 1 แผนกกายภาพบำบัด'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">ID: {k.id}</div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleGeneratePairingCode(k)}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600/20 text-teal-300 hover:bg-teal-600/30 border border-teal-500/30 rounded-xl text-xs font-semibold"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>ออกรหัสจับคู่ (10 นาที)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pairing Code Generator Modal */}
      {pairingModalKiosk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 text-center">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">รหัสจับคู่ตู้ Kiosk</h3>
              <button
                onClick={() => setPairingModalKiosk(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              นำรหัส 6 หลักนี้ไปกรอกที่หน้าจอเริ่มต้นของตู้{' '}
              <strong className="text-white">{pairingModalKiosk.name}</strong>
            </p>

            {pairingCodeResult ? (
              <div className="space-y-4 py-4">
                <div className="font-mono text-4xl font-extrabold tracking-widest text-teal-300 bg-slate-950 py-4 px-6 rounded-2xl border border-teal-500/40 shadow-inner">
                  {pairingCodeResult.code}
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-mono">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>
                    รหัสหมดอายุใน:{' '}
                    <strong className="text-amber-400">
                      {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                    </strong>{' '}
                    นาที
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">กำลังสร้างรหัสจับคู่...</div>
            )}

            <button
              onClick={() => setPairingModalKiosk(null)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* Create Ban Modal */}
      {isBanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-400" />
                <span>สร้างคำสั่งแบนความปลอดภัย</span>
              </h3>
              <button
                onClick={() => setIsBanModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBan} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">ประเภทการแบน *</label>
                <select
                  value={banFormData.type}
                  onChange={(e) => setBanFormData({ ...banFormData, type: e.target.value as 'ip' | 'device' | 'account' })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value="ip">IP Address</option>
                  <option value="device">Device ID</option>
                  <option value="account">User Account</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  ค่าเป้าหมาย (Target Value) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น 192.168.1.100 หรือ user-id"
                  value={banFormData.value}
                  onChange={(e) => setBanFormData({ ...banFormData, value: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">เหตุผลการแบน *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น พยายาม brute force รหัสจับคู่ตู้ Kiosk เกินกำหนด"
                  value={banFormData.reason}
                  onChange={(e) => setBanFormData({ ...banFormData, reason: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  วันหมดอายุ (ปล่อยว่างเพื่อแบนถาวร)
                </label>
                <input
                  type="date"
                  value={banFormData.expires_at}
                  onChange={(e) => setBanFormData({ ...banFormData, expires_at: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBanModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/40"
                >
                  ยืนยันการแบน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Kiosk Modal */}
      {isKioskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Monitor className="w-5 h-5 text-teal-400" />
                <span>ลงทะเบียนตู้ Kiosk เครื่องใหม่</span>
              </h3>
              <button
                onClick={() => setIsKioskModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateKiosk} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">ชื่อเรียกตู้ Kiosk *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ตู้หน้าห้องกายภาพ 1 (Kiosk 01)"
                  value={kioskFormData.name}
                  onChange={(e) => setKioskFormData({ ...kioskFormData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">สถานที่ติดตั้ง</label>
                <input
                  type="text"
                  placeholder="เช่น ชั้น 2 อาคารกายภาพบำบัด"
                  value={kioskFormData.location}
                  onChange={(e) => setKioskFormData({ ...kioskFormData, location: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsKioskModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold shadow-lg shadow-teal-950/40"
                >
                  บันทึกตู้ใหม่
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
