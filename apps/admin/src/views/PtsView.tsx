import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Award,
  Search,
  RefreshCw,
  Users,
  ChevronRight,
  FileCheck
} from 'lucide-react';
import {
  PtRecord,
  PatientRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';

const DEMO_PTS: PtRecord[] = [
  {
    user_id: 'pt-somchai-uuid',
    license_no: 'กภ.12345',
    license_expiry: '2028-12-31',
    specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
    age: 32,
    sex: 'female',
    profile: {
      id: 'pt-somchai-uuid',
      username: 'pt_somchai',
      full_name: 'กภ. วิภาวี สุขใจ',
      role: 'pt',
      status: 'active',
      phone: '085-555-4444',
    },
  },
];

export const PtsView: React.FC = () => {
  const [pts, setPts] = useState<PtRecord[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedPt, setSelectedPt] = useState<PtRecord | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ptData, patientData] = await Promise.all([
        defaultApiClient.pts.list().catch(() => []),
        defaultApiClient.patients.list().catch(() => []),
      ]);
      const rawPts = Array.isArray(ptData) ? ptData : [];
      const ptsToMap = rawPts.length > 0 ? rawPts : DEMO_PTS;

      const normalized: PtRecord[] = ptsToMap.map((p: any) => ({
        user_id: p.user_id || p.id || 'pt-01',
        license_no: p.license_no || p.pt_details?.license_no || p.profile?.pt_details?.license_no || 'กภ.12345',
        license_expiry: p.license_expiry || p.pt_details?.license_expiry || null,
        specialty: p.specialty || p.pt_details?.specialty || p.profile?.pt_details?.specialty || 'กายภาพบำบัดฟื้นฟูทั่วไป',
        age: p.age || p.pt_details?.age || 35,
        sex: p.sex || p.pt_details?.sex || 'male',
        profile: p.profile || {
          id: p.id || p.user_id || 'pt-01',
          username: p.username || 'pt_somchai',
          full_name: p.full_name || 'กภ. ภัทรพล เจริญสุข',
          role: 'pt',
          status: p.status || 'active',
          phone: p.phone || '085-555-4444',
        },
      }));

      setPts(normalized);
      setPatients(Array.isArray(patientData) ? patientData : []);
    } catch {
      setPts(DEMO_PTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const handleUpdate = () => {
      fetchData();
    };
    window.addEventListener('staff-updated', handleUpdate);
    window.addEventListener('patient-created', handleUpdate);
    return () => {
      window.removeEventListener('staff-updated', handleUpdate);
      window.removeEventListener('patient-created', handleUpdate);
    };
  }, []);

  const filteredPts = (Array.isArray(pts) ? pts : []).filter((p) => {
    const name = p.profile?.full_name || '';
    const license = p.license_no || '';
    const specialty = p.specialty || '';
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      license.toLowerCase().includes(search.toLowerCase()) ||
      specialty.toLowerCase().includes(search.toLowerCase())
    );
  });

  const getPtPatients = (ptUserId: string) => {
    return (Array.isArray(patients) ? patients : []).filter(
      (pat) => pat.responsible_pt_id === ptUserId || (pat as any).responsible_pt_user_id === ptUserId
    );
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-teal-600" />
            <span>ทำเนียบนักกายภาพบำบัด (PT Directory)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            รายชื่อนักกายภาพบำบัดประจำโรงพยาบาล เลขที่ใบอนุญาตประกอบวิชาชีพ และคนไข้ที่ดูแล
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ PT, เลขที่ใบอนุญาต, ความเชี่ยวชาญ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      {/* PT Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
            <span>กำลังโหลดรายชื่อนักกายภาพ...</span>
          </div>
        ) : filteredPts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500">
            ไม่พบรายชื่อนักกายภาพบำบัด
          </div>
        ) : (
          filteredPts.map((pt) => {
            const assignedPatients = getPtPatients(pt.user_id);
            return (
              <div
                key={pt.user_id}
                onClick={() => setSelectedPt(pt)}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-6 hover:border-teal-500/50 hover:shadow-xl transition cursor-pointer flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-teal-500/20 text-teal-300 font-bold text-lg flex items-center justify-center border border-teal-500/30">
                        {pt.profile?.full_name?.charAt(0) || 'P'}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-base">
                          {pt.profile?.full_name || 'นักกายภาพ'}
                        </h3>
                        <p className="text-xs text-slate-400">@{pt.profile?.username}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/30">
                      PT
                    </span>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Award className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>ใบประกอบวิชาชีพ: </span>
                      <strong className="font-mono text-white">{pt.license_no || '-'}</strong>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400">
                      <FileCheck className="w-4 h-4 text-teal-400 flex-shrink-0" />
                      <span>ความเชี่ยวชาญ: {pt.specialty || 'กายภาพบำบัดทั่วไป'}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400">
                      <Users className="w-4 h-4 text-sky-400 flex-shrink-0" />
                      <span>คนไข้ที่ดูแล: </span>
                      <strong className="text-white">{assignedPatients.length} ท่าน</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-teal-400 font-medium">
                  <span>ดูรายละเอียดและคนไข้</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PT Assigned Patients Modal */}
      {selectedPt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-teal-400" />
                  <span>{selectedPt.profile?.full_name}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  เลขที่ใบอนุญาต: {selectedPt.license_no} • {selectedPt.specialty || 'กายภาพบำบัดทั่วไป'}
                </p>
              </div>
              <button
                onClick={() => setSelectedPt(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                คนไข้ในความรับผิดชอบ ({getPtPatients(selectedPt.user_id).length} ท่าน)
              </h4>

              <div className="max-h-80 overflow-y-auto space-y-2">
                {getPtPatients(selectedPt.user_id).length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    ยังไม่มีคนไข้ที่มอบหมายให้นักกายภาพท่านนี้
                  </div>
                ) : (
                  getPtPatients(selectedPt.user_id).map((pat) => (
                    <div
                      key={pat.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {pat.first_name} {pat.last_name}
                        </div>
                        <div className="text-slate-400">{pat.injury || 'ไม่ได้ระบุอาการ'}</div>
                      </div>
                      <span className="font-mono font-bold text-teal-400">{pat.hn}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => setSelectedPt(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-semibold"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
