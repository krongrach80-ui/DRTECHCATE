import React, { useState, useEffect } from 'react';
import {
  Dumbbell,
  Search,
  Plus,
  Edit,
  Trash2,
  Lock,
  Upload,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Sparkles,
  Sliders,
  Copy,
  Video
} from 'lucide-react';
import {
  ExerciseRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';
import {
  SmartExerciseLibraryModal,
  SmartModpackModal,
  ExerciseBuilderModal
} from '../smart-portal/index.js';
import { ALL_CLINICAL_EXERCISES } from '../../../../packages/pose-engine/src/index.js';

interface ExerciseCatalogViewProps {
  currentUserId: string;
  onOpenPrescription?: () => void;
}

const DEMO_EXERCISES: ExerciseRecord[] = ALL_CLINICAL_EXERCISES.map((ex) => ({
  id: ex.id || 'ex-default',
  title: `${ex.nameTh} (${ex.nameEn} / ${ex.nameCn})`,
  description: ex.descriptionTh || '',
  target_joint: ex.targetJoint,
  target_muscle: ex.targetJoint === 'shoulder' ? 'Deltoid, Rotator Cuff' : ex.targetJoint === 'knee' ? 'Quadriceps, Hamstrings' : ex.targetJoint === 'hip' ? 'Gluteus, Hip Flexors' : ex.targetJoint === 'ankle' ? 'Gastrocnemius, Soleus' : ex.targetJoint === 'neck' ? 'Deep Neck Flexors' : 'Musculoskeletal',
  suitable_for: 'ผู้ป่วยฟื้นฟูสมรรถภาพทางกายภาพบำบัด',
  warnings: ex.safetyContraindications.stopOnPainMessageTh || 'หยุดทันทีเมื่อรู้สึกเจ็บ',
  default_sets: ex.defaultPrescription?.totalSets || 3,
  default_reps: ex.defaultPrescription?.repsPerSet || 10,
  default_hold_sec: ex.angleMechanics?.holdDurationSec,
  default_duration_sec: ex.defaultDurationSec || ex.defaultPrescription?.durationSec,
  mode: (ex as any).mode || (ex.evaluationMode === 'timer' ? 'timer' : 'camera'),
  clinical_source: ex.clinicalSource,
  source: ex.clinicalSource,
  pt_adjustable_notice: 'นักกายภาพผู้รับผิดชอบปรับตามผู้ป่วยแต่ละราย',
  difficulty: 'easy',
  image_path: `/assets/exercises/${ex.id}.svg`,
  created_at: '2026-10-31T00:00:00.000Z',
}));

export const ExerciseCatalogView: React.FC<ExerciseCatalogViewProps> = ({
  currentUserId,
  onOpenPrescription,
}) => {
  const [exercises, setExercises] = useState<ExerciseRecord[]>(DEMO_EXERCISES);
  const [search, setSearch] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'hospital'>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSmartExerciseModalOpen, setIsSmartExerciseModalOpen] = useState(false);
  const [isSmartModpackModalOpen, setIsSmartModpackModalOpen] = useState(false);

  // AI Pose Studio State
  const [isExerciseBuilderOpen, setIsExerciseBuilderOpen] = useState(false);
  const [selectedExerciseForAi, setSelectedExerciseForAi] = useState<ExerciseRecord | null>(null);
  const [isCloneMode, setIsCloneMode] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseRecord | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    target_muscle: '',
    difficulty: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    default_sets: 3,
    default_reps: 10,
    duration_seconds: 30,
  });

  const fetchExercises = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const list = await defaultApiClient.exercises.list().catch(() => []);
      const filtered = Array.isArray(list) ? list.filter((e: any) => e.is_active !== false) : [];
      const safe = filtered.length > 0 ? filtered : DEMO_EXERCISES;
      setExercises(safe);
    } catch {
      setExercises(DEMO_EXERCISES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setErrorMsg('กรุณากรอกชื่อท่ากายภาพ');
      return;
    }

    try {
      setActionLoading(true);
      await defaultApiClient.exercises.create({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        target_muscle: formData.target_muscle.trim() || undefined,
        difficulty: formData.difficulty,
        default_sets: formData.default_sets,
        default_reps: formData.default_reps,
        duration_seconds: formData.duration_seconds,
      });

      setSuccessMsg(`สร้างท่ากายภาพใหม่ "${formData.title}" เรียบร้อย (ท่านเป็นผู้สร้าง)`);
      setIsCreateModalOpen(false);
      setFormData({
        title: '',
        description: '',
        target_muscle: '',
        difficulty: 'beginner',
        default_sets: 3,
        default_reps: 10,
        duration_seconds: 30,
      });
      await fetchExercises();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถสร้างท่ากายภาพได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenEdit = (ex: ExerciseRecord) => {
    if (ex.created_by && ex.created_by !== currentUserId) {
      setErrorMsg('ท่านสามารถแก้ไขได้เฉพาะท่ากายภาพที่ท่านสร้างขึ้นเองเท่านั้น');
      return;
    }
    setEditingExercise(ex);
    setFormData({
      title: ex.title,
      description: ex.description || '',
      target_muscle: ex.target_muscle || '',
      difficulty: (ex.difficulty as 'beginner' | 'intermediate' | 'advanced') || 'beginner',
      default_sets: ex.default_sets || 3,
      default_reps: ex.default_reps || 10,
      duration_seconds: ex.duration_seconds || 30,
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExercise) return;

    try {
      setActionLoading(true);
      await defaultApiClient.exercises.update(editingExercise.id, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        target_muscle: formData.target_muscle.trim() || undefined,
        difficulty: formData.difficulty,
        default_sets: formData.default_sets,
        default_reps: formData.default_reps,
        duration_seconds: formData.duration_seconds,
      });

      setSuccessMsg(`อัปเดตท่ากายภาพ "${formData.title}" สำเร็จ`);
      setIsEditModalOpen(false);
      await fetchExercises();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถอัปเดตท่ากายภาพได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteExercise = async (ex: ExerciseRecord) => {
    if (ex.created_by && ex.created_by !== currentUserId) {
      setErrorMsg('ท่านสามารถลบได้เฉพาะท่ากายภาพที่ท่านสร้างขึ้นเองเท่านั้น (DB Trigger Enforced)');
      return;
    }
    if (!window.confirm(`ยืนยันการลบท่า "${ex.title}"?`)) return;

    try {
      setActionLoading(true);
      // Optimistic state removal: remove card from screen immediately
      setExercises((prev) => prev.filter((item) => item.id !== ex.id));
      await defaultApiClient.exercises.delete(ex.id);
      setSuccessMsg(`ลบท่า "${ex.title}" เรียบร้อย`);
      await fetchExercises();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลบท่ากายภาพได้');
      await fetchExercises();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadMedia = async (ex: ExerciseRecord, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (ex.created_by && ex.created_by !== currentUserId) {
      setErrorMsg('ไม่อนุญาตให้อัปโหลดสื่อทับท่าที่ผู้อื่นสร้าง');
      return;
    }

    try {
      setActionLoading(true);
      await defaultApiClient.exercises.uploadMedia(ex.id, file);
      setSuccessMsg(`อัปโหลดสื่อสำหรับท่า "${ex.title}" เรียบร้อย`);
      await fetchExercises();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการอัปโหลดสื่อ');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredExercises = exercises.filter((ex) => {
    const matchesSearch =
      ex.title.toLowerCase().includes(search.toLowerCase()) ||
      (ex.target_muscle && ex.target_muscle.toLowerCase().includes(search.toLowerCase()));

    const isMine = ex.created_by === currentUserId;
    if (ownershipFilter === 'mine') return matchesSearch && isMine;
    if (ownershipFilter === 'hospital') return matchesSearch && !isMine;
    return matchesSearch;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 shadow-xs">
              <Dumbbell className="w-6 h-6" />
            </span>
            <span>คลังท่ากายภาพบำบัด (Exercise Catalog)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            ดูท่าทั้งหมดในคลัง เพิ่มท่าใหม่ และจัดการเฉพาะท่าที่ท่านสร้างขึ้นเอง (Database Trigger Enforced)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {onOpenPrescription && (
            <button
              type="button"
              onClick={onOpenPrescription}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm transition shadow-md shadow-emerald-950/20 cursor-pointer active:scale-95"
            >
              <Sliders className="w-4 h-4" />
              <span>📅 จัดคอร์ส/สั่งจ่ายท่าฝึกเฉพาะคน</span>
            </button>
          )}
          <button
            onClick={fetchExercises}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="รีเฟรช"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setSelectedExerciseForAi(null);
              setIsCloneMode(false);
              setIsExerciseBuilderOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm transition shadow-md shadow-blue-950/20 active:scale-95"
          >
            <Video className="w-4 h-4" />
            <span>🎯 AI Pose Studio</span>
          </button>
          <button
            onClick={() => setIsSmartExerciseModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-blue-200 hover:bg-blue-50/80 text-blue-700 font-bold text-sm transition shadow-sm active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Smart Upload</span>
          </button>
          <button
            onClick={() => setIsSmartModpackModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-blue-200 hover:bg-blue-50/80 text-blue-700 font-bold text-sm transition shadow-sm active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Smart Modpack</span>
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md shadow-emerald-950/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างท่ากายภาพใหม่</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600" />
            <span className="font-medium">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            <span className="font-medium">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-slate-50/80 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-center shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อท่า, กล้ามเนื้อเป้าหมาย..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setOwnershipFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              ownershipFilter === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            ทั้งหมด ({exercises.length})
          </button>
          <button
            onClick={() => setOwnershipFilter('mine')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              ownershipFilter === 'mine'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            ท่าที่ฉันสร้าง
          </button>
          <button
            onClick={() => setOwnershipFilter('hospital')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              ownershipFilter === 'hospital'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            คลังส่วนกลาง
          </button>
        </div>
      </div>

      {/* Exercises Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-500">
            กำลังโหลดรายการท่ากายภาพ...
          </div>
        ) : filteredExercises.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500">
            ไม่พบท่ากายภาพในหมวดนี้
          </div>
        ) : (
          filteredExercises.map((ex) => {
            const isMine = ex.created_by === currentUserId;
            const isTimer = ex.mode === 'timer' || ex.id === 'chin-tuck' || ex.id === 'shoulder-pendulum';
            return (
              <div
                key={ex.id}
                className="bg-white rounded-2xl border border-blue-100/90 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between overflow-hidden p-5 group"
              >
                <div className="space-y-3">
                  {/* Medical Posture Illustration */}
                  <div className="w-full h-36 bg-gradient-to-br from-slate-900 via-blue-950 to-emerald-950 rounded-xl flex items-center justify-center overflow-hidden border border-blue-900/30 p-2 shadow-inner">
                    <img
                      src={ex.image_path || `/assets/exercises/${ex.id}.svg`}
                      alt={ex.title}
                      className="max-h-32 w-auto object-contain opacity-95 group-hover:scale-105 transition duration-200"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-slate-900 text-base leading-snug">{ex.title}</h4>
                    {isMine ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shadow-2xs">
                        <Sparkles className="w-3 h-3" />
                        <span>ท่าของฉัน</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 shadow-2xs">
                        <Lock className="w-3 h-3" />
                        <span>ส่วนกลาง</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2">
                    {ex.description || 'ไม่มีคำอธิบายเพิ่มเติม'}
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <span
                      className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-bold ${
                        isTimer
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-teal-50 text-teal-700 border-teal-200'
                      }`}
                    >
                      {isTimer
                        ? '⏱️ โหมดจับเวลานำ (Timer Mode)'
                        : '📹 โหมดกล้อง AI (Camera Mode)'}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 font-medium">
                      🎯 {ex.target_muscle || 'กล้ามเนื้อรวม'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase ${
                        ex.difficulty === 'hard' || ex.difficulty === 'advanced'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : ex.difficulty === 'medium' || ex.difficulty === 'intermediate'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {ex.difficulty === 'hard' || ex.difficulty === 'advanced'
                        ? 'ยาก (Advanced)'
                        : ex.difficulty === 'medium' || ex.difficulty === 'intermediate'
                        ? 'ปานกลาง (Intermediate)'
                        : 'ง่าย (Beginner)'}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-50 font-mono text-emerald-700 font-bold border border-emerald-200">
                      {ex.default_sets} เซ็ต × {ex.default_reps} ครั้ง
                    </span>
                    {ex.default_hold_sec ? (
                      <span className="px-2 py-0.5 rounded-lg bg-teal-50 font-mono text-teal-700 border border-teal-200 text-[10px] font-semibold">
                        ค้าง {ex.default_hold_sec} วิ
                      </span>
                    ) : null}
                    {ex.default_duration_sec ? (
                      <span className="px-2 py-0.5 rounded-lg bg-blue-50 font-mono text-blue-700 border border-blue-200 text-[10px] font-semibold">
                        รอบละ {ex.default_duration_sec} วิ
                      </span>
                    ) : null}
                  </div>

                  {/* Clinical Citation & PT Adjustment Notice */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] space-y-1">
                    {(ex.clinical_source || ex.source) && (
                      <div className="text-slate-600 font-mono text-[10px] truncate" title={ex.clinical_source || ex.source || ''}>
                        <span className="text-blue-700 font-bold">🏛️ แหล่งอ้างอิง:</span> {ex.clinical_source || ex.source}
                      </div>
                    )}
                    <div className="text-emerald-700 font-medium text-[10px] flex items-center gap-1">
                      <span>👩‍⚕️</span>
                      <span>นักกายภาพผู้รับผิดชอบปรับตามผู้ป่วยแต่ละราย</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">
                    ระยะเวลา ~{ex.duration_seconds || ex.default_duration_sec || 30} วิ
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* AI Configuration & Calibration Button */}
                    <button
                      onClick={() => {
                        setSelectedExerciseForAi(ex);
                        setIsCloneMode(false);
                        setIsExerciseBuilderOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold flex items-center gap-1 transition"
                      title="ตั้งค่า AI ตรวจจับมุม & Calibrate"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>AI Setup</span>
                    </button>

                    {/* Clone Exercise Button */}
                    <button
                      onClick={() => {
                        setSelectedExerciseForAi(ex);
                        setIsCloneMode(true);
                        setIsExerciseBuilderOpen(true);
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                      title="โคลนท่านี้เป็นท่าใหม่"
                    >
                      <Copy className="w-3 h-3" />
                      <span>โคลน</span>
                    </button>

                    {/* Media Upload (Only mine) */}
                    {isMine && (
                      <label
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition"
                        title="อัปโหลดรูปภาพ/วิดีโอประกอบ"
                      >
                        <Upload className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*,video/*"
                          onChange={(e) => handleUploadMedia(ex, e)}
                          className="hidden"
                        />
                      </label>
                    )}

                    {/* Edit Button (Only mine) */}
                    {isMine ? (
                      <button
                        onClick={() => handleOpenEdit(ex)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition"
                        title="แก้ไขท่ากายภาพนี้"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="p-1.5 text-slate-300" title="ท่าส่วนกลาง แก้ไขไม่ได้">
                        <Lock className="w-4 h-4" />
                      </span>
                    )}

                    {/* Delete Button (Only mine) */}
                    {isMine && (
                      <button
                        onClick={() => handleDeleteExercise(ex)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="ลบท่านี้"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Create Exercise */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white border border-blue-100 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                <span>สร้างท่ากายภาพใหม่</span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExercise} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อท่ากายภาพ</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="เช่น Quad Sets, Wall Squat, Straight Leg Raise"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">กล้ามเนื้อเป้าหมาย</label>
                <input
                  type="text"
                  value={formData.target_muscle}
                  onChange={(e) => setFormData({ ...formData, target_muscle: e.target.value })}
                  placeholder="เช่น Quadriceps, Hamstrings, Core, กล้ามเนื้อสะโพก"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ความยาก</label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="beginner">ง่าย (Beginner)</option>
                    <option value="intermediate">ปานกลาง (Intermediate)</option>
                    <option value="advanced">ยาก (Advanced)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">เซ็ตเริ่มต้น</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.default_sets}
                    onChange={(e) => setFormData({ ...formData, default_sets: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ครั้งเริ่มต้น</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.default_reps}
                    onChange={(e) => setFormData({ ...formData, default_reps: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">คำแนะนำ / ข้อควรระวัง</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="ระบุข้อควรระวัง เช่น อย่าเกร็งคอ, หายใจออกขณะออกแรง..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-md shadow-emerald-950/20 active:scale-95"
                >
                  {actionLoading ? 'กำลังสร้าง...' : 'สร้างท่า'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Exercise */}
      {isEditModalOpen && editingExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white border border-blue-100 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600" />
                <span>แก้ไขท่ากายภาพ</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateExercise} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อท่ากายภาพ</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">กล้ามเนื้อเป้าหมาย</label>
                <input
                  type="text"
                  value={formData.target_muscle}
                  onChange={(e) => setFormData({ ...formData, target_muscle: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ความยาก</label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="beginner">ง่าย (Beginner)</option>
                    <option value="intermediate">ปานกลาง (Intermediate)</option>
                    <option value="advanced">ยาก (Advanced)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">เซ็ตเริ่มต้น</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.default_sets}
                    onChange={(e) => setFormData({ ...formData, default_sets: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ครั้งเริ่มต้น</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.default_reps}
                    onChange={(e) => setFormData({ ...formData, default_reps: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">คำแนะนำ / ข้อควรระวัง</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-md shadow-emerald-950/20 active:scale-95"
                >
                  {actionLoading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Master Prompt v4: Smart Exercise Media Upload Modal */}
      <SmartExerciseLibraryModal
        isOpen={isSmartExerciseModalOpen}
        onClose={() => setIsSmartExerciseModalOpen(false)}
        onSuccess={() => {
          setIsSmartExerciseModalOpen(false);
          fetchExercises();
        }}
      />

      {/* Master Prompt v4: Smart Modpack Preset Builder Modal */}
      <SmartModpackModal
        isOpen={isSmartModpackModalOpen}
        onClose={() => setIsSmartModpackModalOpen(false)}
        onSuccess={() => {
          setIsSmartModpackModalOpen(false);
          fetchExercises();
        }}
      />

      {/* Dynamic AI Biomechanical Exercise Builder & Webcam Calibrator Modal */}
      <ExerciseBuilderModal
        isOpen={isExerciseBuilderOpen}
        onClose={() => {
          setIsExerciseBuilderOpen(false);
          setSelectedExerciseForAi(null);
          setIsCloneMode(false);
        }}
        exerciseToEdit={selectedExerciseForAi}
        isClone={isCloneMode}
        onSuccess={async (savedConfig) => {
          setIsExerciseBuilderOpen(false);
          setSuccessMsg(`บันทึกการตั้งค่า AI สำหรับท่า "${savedConfig?.nameTh || 'ใหม่'}" เรียบร้อย`);
          await fetchExercises();
        }}
      />
    </div>
  );
};
