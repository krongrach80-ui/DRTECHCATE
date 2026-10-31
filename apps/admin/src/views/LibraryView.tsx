import React, { useState, useEffect } from 'react';
import {
  Dumbbell,
  Gamepad2,
  Package,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  HelpCircle,
  Sparkles,
  Sliders,
  Copy,
  Video
} from 'lucide-react';
import {
  ExerciseRecord,
  MinigameRecord,
  QuestionRecord,
  ModpackRecord,
  defaultApiClient
} from '../../../../packages/api-client/src/index.js';
import {
  SmartExerciseLibraryModal,
  SmartModpackModal,
  ExerciseBuilderModal
} from '../smart-portal/index.js';
import { ALL_99_PHYSICAL_CARD_QUESTIONS } from '../../../kiosk/src/minigame-cards/index.js';
import { ALL_CLINICAL_EXERCISES } from '../../../../packages/pose-engine/src/index';

const DEMO_EXERCISES: ExerciseRecord[] = ALL_CLINICAL_EXERCISES.map((ex) => ({
  id: ex.id || 'ex-default',
  title: `${ex.nameTh} (${ex.nameEn} / ${ex.nameCn})`,
  description: ex.descriptionTh || '',
  target_joint: ex.targetJoint,
  suitable_for: 'ผู้ป่วยฟื้นฟูสมรรถภาพทางกายภาพบำบัด',
  warnings: ex.safetyContraindications.stopOnPainMessageTh || 'หยุดทันทีเมื่อรู้สึกเจ็บ',
  default_sets: ex.defaultPrescription.totalSets,
  default_reps: ex.defaultPrescription.repsPerSet,
  difficulty: 'easy',
  image_path: null,
  created_at: '2026-10-31T00:00:00.000Z',
}));

const DEMO_MODPACKS: ModpackRecord[] = [
  {
    id: 'mp-frozen-shoulder-01',
    name: 'ชุดท่าฟื้นฟูข้อไหล่ติดระยะที่ 1 (Adhesive Capsulitis Protocol)',
    description: 'โปรแกรมมาตรฐานสำหรับการฟื้นฟูข้อไหล่ติดและลดการยึดรั้งของปลอกหุ้มข้อต่อ',
    items: [
      {
        exercise_id: 'shoulder-pendulum',
        exercise: DEMO_EXERCISES[0],
        sets: 3,
        reps: 15,
        position: 1,
      },
      {
        exercise_id: 'shoulder-flexion',
        exercise: DEMO_EXERCISES[1],
        sets: 3,
        reps: 10,
        position: 2,
      },
    ],
    created_at: '2026-10-26T08:00:00.000Z',
  },
];

const DEMO_MINIGAMES: MinigameRecord[] = [
  {
    id: 'mg-physical-cards',
    title: 'การ์ดกายภาพ (Physical Rehab Card Game - 99 ข้อ)',
    description: 'ฝึกการรับรู้และตอบคำถามโดยยกมือซ้าย (ใช่) หรือยกมือขวา (ไม่) ผ่านกล้อง หรือแตะหน้าจอ',
    type: 'physical_cards',
  },
  {
    id: 'mg-memory-cards',
    title: 'เกมจับคู่การ์ดความจำ (Cognitive Memory Match)',
    description: 'ฝึกความจำระยะสั้นและการประมวลผลของสมองระหว่างพักเซ็ต',
    type: 'memory',
  },
  {
    id: 'mg-math-speed',
    title: 'เกมคำนวณเลขเร็ว (Brain Speed Arithmetic)',
    description: 'กระตุ้นการทำงานของสมองส่วนหน้าด้วยการคิดเลขง่ายๆ ภายใต้เวลาที่กำหนด',
    type: 'math',
  },
];

export const LibraryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'exercises' | 'minigames' | 'modpacks'>('exercises');
  const [exercises, setExercises] = useState<ExerciseRecord[]>(DEMO_EXERCISES);
  const [minigames, setMinigames] = useState<MinigameRecord[]>(DEMO_MINIGAMES);
  const [modpacks, setModpacks] = useState<ModpackRecord[]>(DEMO_MODPACKS);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSmartExerciseModalOpen, setIsSmartExerciseModalOpen] = useState<boolean>(false);
  const [isSmartModpackModalOpen, setIsSmartModpackModalOpen] = useState<boolean>(false);

  // AI Pose Studio State
  const [isExerciseBuilderOpen, setIsExerciseBuilderOpen] = useState<boolean>(false);
  const [selectedExerciseForAi, setSelectedExerciseForAi] = useState<ExerciseRecord | null>(null);
  const [isCloneMode, setIsCloneMode] = useState<boolean>(false);

  // Modals
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState<boolean>(false);
  const [exerciseFormData, setExerciseFormData] = useState({
    title: '',
    description: '',
    target_joint: 'knee',
    suitable_for: '',
    warnings: '',
    default_sets: 3,
    default_reps: 10,
    difficulty: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
  });
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);

  // Minigame Questions State
  const [selectedMinigame, setSelectedMinigame] = useState<MinigameRecord | null>(null);
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState<boolean>(false);
  const [questionFormData, setQuestionFormData] = useState({
    prompt: '',
    choices: ['', '', '', ''],
    answer: '',
  });

  // Modpack Modal
  const [isModpackModalOpen, setIsModpackModalOpen] = useState<boolean>(false);
  const [modpackFormData, setModpackFormData] = useState<{
    name: string;
    description: string;
    items: Array<{ exercise_id: string; sets: number; reps: number; position: number }>;
  }>({
    name: '',
    description: '',
    items: [],
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [exData, mgData, mpData] = await Promise.all([
        defaultApiClient.exercises.list().catch(() => []),
        defaultApiClient.minigames.list().catch(() => []),
        defaultApiClient.modpacks.list().catch(() => []),
      ]);
      const safeEx = Array.isArray(exData) && exData.length > 0 ? exData : DEMO_EXERCISES;
      const safeMg = Array.isArray(mgData) && mgData.length > 0 ? mgData : DEMO_MINIGAMES;
      const safeMp = Array.isArray(mpData) && mpData.length > 0 ? mpData : DEMO_MODPACKS;
      setExercises(safeEx);
      setMinigames(safeMg);
      setModpacks(safeMp);
    } catch {
      setExercises(DEMO_EXERCISES);
      setMinigames(DEMO_MINIGAMES);
      setModpacks(DEMO_MODPACKS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const created = await defaultApiClient.exercises.create(exerciseFormData);
      if (selectedMediaFile && created.id) {
        await defaultApiClient.exercises.uploadMedia(created.id, selectedMediaFile);
      }
      setSuccessMsg(`เพิ่มท่ากายภาพ "${created.title}" สำเร็จเรียบร้อย`);
      setIsExerciseModalOpen(false);
      setSelectedMediaFile(null);
      setExerciseFormData({
        title: '',
        description: '',
        target_joint: 'knee',
        suitable_for: '',
        warnings: '',
        default_sets: 3,
        default_reps: 10,
        difficulty: 'beginner',
      });
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถเพิ่มท่ากายภาพได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteExercise = async (id: string, title: string) => {
    if (!window.confirm(`ยืนยันการลบท่า "${title}"?`)) return;
    try {
      setActionLoading(true);
      // Optimistic state removal: remove card from screen immediately
      setExercises((prev) => prev.filter((e) => e.id !== id));
      await defaultApiClient.exercises.delete(id);
      setSuccessMsg(`ลบท่ากายภาพเรียบร้อย`);
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลบท่ากายภาพได้');
      await fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const openMinigameQuestions = async (game: MinigameRecord) => {
    setSelectedMinigame(game);
    if (game.id === 'mg-physical-cards') {
      const mapped = ALL_99_PHYSICAL_CARD_QUESTIONS.map((q) => ({
        id: q.id,
        prompt: `[${q.category}] ภาพ: ${q.imageDescription} — ${q.prompt}`,
        choices: ['ใช่ (ยกมือซ้าย)', 'ไม่ (ยกมือขวา)'],
        answer: q.correctAnswer === 'yes' ? 'ใช่ (ยกมือซ้าย)' : 'ไม่ (ยกมือขวา)',
        minigame_id: 'mg-physical-cards',
      }));
      setQuestions(mapped);
      return;
    }
    try {
      const qList = await defaultApiClient.minigames.listQuestions(game.id);
      setQuestions(qList);
    } catch {
      setQuestions([]);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMinigame) return;
    try {
      setActionLoading(true);
      await defaultApiClient.minigames.createQuestion(selectedMinigame.id, questionFormData);
      setSuccessMsg('เพิ่มโจทย์มินิเกมเรียบร้อย');
      setIsQuestionModalOpen(false);
      setQuestionFormData({ prompt: '', choices: ['', '', '', ''], answer: '' });
      await openMinigameQuestions(selectedMinigame);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถเพิ่มโจทย์ได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!selectedMinigame) return;
    try {
      setActionLoading(true);
      // Optimistic state removal: remove question from screen immediately
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
      await defaultApiClient.minigames.deleteQuestion(selectedMinigame.id, questionId);
      setSuccessMsg('ลบโจทย์คำถามเรียบร้อย');
      await openMinigameQuestions(selectedMinigame);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลบโจทย์ได้');
      await openMinigameQuestions(selectedMinigame);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateModpack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modpackFormData.items.length === 0) {
      setErrorMsg('กรุณาเลือกท่ากายภาพอย่างน้อย 1 ท่าในชุด modpack');
      return;
    }
    try {
      setActionLoading(true);
      await defaultApiClient.modpacks.create(modpackFormData);
      setSuccessMsg(`สร้างชุดท่ากายภาพ "${modpackFormData.name}" สำเร็จ`);
      setIsModpackModalOpen(false);
      setModpackFormData({ name: '', description: '', items: [] });
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถสร้างชุดท่าได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteModpack = async (id: string, name: string) => {
    if (!window.confirm(`ยืนยันการลบชุดท่า "${name}"?`)) return;
    try {
      setActionLoading(true);
      // Optimistic state removal: remove modpack from screen immediately
      setModpacks((prev) => prev.filter((m) => m.id !== id));
      await defaultApiClient.modpacks.delete(id);
      setSuccessMsg('ลบชุดท่าเรียบร้อย');
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลบชุดท่าได้');
      await fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const toggleExerciseInModpack = (exerciseId: string) => {
    const exists = modpackFormData.items.find((i) => i.exercise_id === exerciseId);
    if (exists) {
      setModpackFormData({
        ...modpackFormData,
        items: modpackFormData.items.filter((i) => i.exercise_id !== exerciseId),
      });
    } else {
      const ex = exercises.find((e) => e.id === exerciseId);
      setModpackFormData({
        ...modpackFormData,
        items: [
          ...modpackFormData.items,
          {
            exercise_id: exerciseId,
            sets: ex?.default_sets || 3,
            reps: ex?.default_reps || 10,
            position: modpackFormData.items.length + 1,
          },
        ],
      });
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-teal-600" />
            <span>คลังท่ากายภาพ มินิเกม และชุดท่า (Library)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            จัดการท่ากายภาพ อัปโหลดสื่อบันทึก ชุดท่าสำเร็จรูป (Modpack) และโจทย์มินิเกมฝึกสมอง
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
          {activeTab === 'exercises' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedExerciseForAi(null);
                  setIsCloneMode(false);
                  setIsExerciseBuilderOpen(true);
                }}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 via-cyan-600 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white font-medium text-sm transition shadow-lg shadow-teal-950/40"
              >
                <Video className="w-4 h-4" />
                <span>🎯 AI Pose Studio (No-Code & Webcam)</span>
              </button>
              <button
                onClick={() => setIsSmartExerciseModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-sm transition shadow-lg shadow-emerald-950/40"
              >
                <Sparkles className="w-4 h-4" />
                <span>Smart Exercise Upload (v4)</span>
              </button>
              <button
                onClick={() => setIsExerciseModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition shadow-lg shadow-teal-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มท่ากายภาพใหม่</span>
              </button>
            </div>
          )}
          {activeTab === 'modpacks' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSmartModpackModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-sm transition shadow-lg shadow-emerald-950/40"
              >
                <Sparkles className="w-4 h-4" />
                <span>Smart Modpack Builder (v4)</span>
              </button>
              <button
                onClick={() => setIsModpackModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition shadow-lg shadow-teal-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>สร้างชุดท่า Modpack ใหม่</span>
              </button>
            </div>
          )}
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

      {/* Main Tabs Navigation */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('exercises')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'exercises'
              ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Dumbbell className="w-4 h-4" />
          <span>ท่ากายภาพ ({exercises.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('modpacks')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'modpacks'
              ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>ชุดท่า Modpacks ({modpacks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('minigames')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'minigames'
              ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>มินิเกม & โจทย์ ({minigames.length})</span>
        </button>
      </div>

      {/* TAB 1: EXERCISES */}
      {activeTab === 'exercises' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full text-center py-12 text-slate-500">
                กำลังโหลดท่ากายภาพ...
              </div>
            ) : exercises.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-500">
                ยังไม่มีรายการท่ากายภาพในระบบ กด "เพิ่มท่ากายภาพใหม่" ด้านบน
              </div>
            ) : (
              exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col justify-between hover:border-slate-700 transition"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                          <Dumbbell className="w-4 h-4" />
                        </span>
                        <h3 className="font-bold text-white text-base">{ex.title}</h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          ex.difficulty === 'easy' || ex.difficulty === 'beginner'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : ex.difficulty === 'medium' || ex.difficulty === 'intermediate'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {ex.difficulty === 'easy' || ex.difficulty === 'beginner'
                          ? 'BEGINNER'
                          : ex.difficulty === 'medium' || ex.difficulty === 'intermediate'
                          ? 'INTERMEDIATE'
                          : 'ADVANCED'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2">
                      {ex.description || 'ไม่มีคำอธิบาย'}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950 p-3 rounded-2xl border border-slate-800/80">
                      <div>
                        <span className="text-slate-500">ข้อต่อเป้าหมาย:</span>
                        <div className="font-semibold text-slate-300">{ex.target_joint || '-'}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">ค่าเริ่มต้น:</span>
                        <div className="font-semibold text-teal-400">
                          {ex.default_sets} เซ็ต × {ex.default_reps} ครั้ง
                        </div>
                      </div>
                    </div>
                  </div>

                    <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedExerciseForAi(ex);
                            setIsCloneMode(false);
                            setIsExerciseBuilderOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-medium flex items-center gap-1 transition"
                          title="ตั้งค่า AI ตรวจจับมุม & Calibrate"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>AI Setup</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedExerciseForAi(ex);
                            setIsCloneMode(true);
                            setIsExerciseBuilderOpen(true);
                          }}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition"
                          title="โคลนท่านี้เป็นท่าใหม่"
                        >
                          <Copy className="w-3 h-3" />
                          <span>โคลน</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">ID: {ex.id.slice(0, 8)}...</span>
                        <button
                          onClick={() => handleDeleteExercise(ex.id, ex.title)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                          title="ลบท่านี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
          </div>
        </div>
      )}

      {/* TAB 2: MODPACKS */}
      {activeTab === 'modpacks' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modpacks.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-500">
                ยังไม่มีชุดท่า Modpack ในระบบ
              </div>
            ) : (
              modpacks.map((mp) => (
                <div
                  key={mp.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          <Package className="w-4 h-4" />
                        </span>
                        <h3 className="font-bold text-white text-base">{mp.name}</h3>
                      </div>
                      <button
                        onClick={() => handleDeleteModpack(mp.id, mp.name)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-400">{mp.description || 'ไม่มีคำอธิบาย'}</p>

                    <div className="space-y-1.5 bg-slate-950 p-3 rounded-2xl border border-slate-800/80">
                      <div className="text-xs font-semibold text-slate-400 mb-1">
                        รายการท่าในชุด ({mp.items?.length || 0} ท่า):
                      </div>
                      {mp.items && mp.items.length > 0 ? (
                        mp.items.map((it, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs text-slate-300"
                          >
                            <span>
                              {idx + 1}. {it.exercise?.title || `Exercise ${it.exercise_id.slice(0, 6)}`}
                            </span>
                            <span className="font-mono text-teal-400">
                              {it.sets}×{it.reps}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-500">ไม่มีรายการท่า</div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MINIGAMES & QUESTIONS */}
      {activeTab === 'minigames' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {minigames.map((game) => (
              <div
                key={game.id}
                onClick={() => openMinigameQuestions(game)}
                className={`p-5 rounded-3xl border-2 transition-all cursor-pointer ${
                  selectedMinigame?.id === game.id
                    ? 'bg-slate-900 border-teal-400 shadow-xl shadow-teal-500/20 ring-2 ring-teal-500/40'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Gamepad2 className={`w-7 h-7 flex-shrink-0 ${selectedMinigame?.id === game.id ? 'text-teal-300' : 'text-slate-400'}`} />
                  <div>
                    <h3 className="font-bold text-white text-base leading-snug">{game.title}</h3>
                    <p className={`text-xs mt-1 ${selectedMinigame?.id === game.id ? 'text-teal-200' : 'text-slate-400'}`}>
                      {game.description || 'มินิเกมฝึกสมอง'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedMinigame && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-teal-400" />
                    <span>โจทย์คำถามสำหรับ: {selectedMinigame.title}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    คำถามจะถูกสุ่มแสดงให้คนไข้ตอบบนหน้าจอตู้ Kiosk ระหว่างฝึก
                  </p>
                </div>
                <button
                  onClick={() => setIsQuestionModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  <span>เพิ่มโจทย์ใหม่</span>
                </button>
              </div>

              <div className="space-y-3">
                {questions.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    ยังไม่มีโจทย์คำถามในมินิเกมนี้
                  </div>
                ) : (
                  questions.map((q) => (
                    <div
                      key={q.id}
                      className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-start justify-between"
                    >
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-white">{q.prompt}</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {q.choices.map((c: string, idx: number) => (
                            <div
                              key={idx}
                              className={`px-3 py-1.5 rounded-lg border ${
                                c === q.answer
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-bold'
                                  : 'bg-slate-900 border-slate-800 text-slate-400'
                              }`}
                            >
                              {idx + 1}. {c} {c === q.answer && '✓ (เฉลย)'}
                            </div>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Exercise Modal */}
      {isExerciseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-teal-400" />
                <span>เพิ่มท่ากายภาพใหม่</span>
              </h3>
              <button
                onClick={() => setIsExerciseModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExercise} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">ชื่อท่ากายภาพ *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ยกดรายข้อเข่า (Straight Leg Raise)"
                  value={exerciseFormData.title}
                  onChange={(e) =>
                    setExerciseFormData({ ...exerciseFormData, title: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">คำอธิบายวิธีฝึก</label>
                <textarea
                  rows={2}
                  placeholder="นอนหงาย เกร็งกล้ามเนื้อหน้าขา ยกขาขึ้น 45 องศา ค้างไว้ 5 วินาที..."
                  value={exerciseFormData.description}
                  onChange={(e) =>
                    setExerciseFormData({ ...exerciseFormData, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ข้อต่อเป้าหมาย</label>
                  <input
                    type="text"
                    placeholder="เช่น knee, shoulder, lumbar"
                    value={exerciseFormData.target_joint}
                    onChange={(e) =>
                      setExerciseFormData({ ...exerciseFormData, target_joint: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">ระดับความยาก</label>
                  <select
                    value={exerciseFormData.difficulty}
                    onChange={(e) =>
                      setExerciseFormData({
                        ...exerciseFormData,
                        difficulty: e.target.value as 'beginner' | 'intermediate' | 'advanced',
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="beginner">ง่าย (Beginner)</option>
                    <option value="intermediate">ปานกลาง (Intermediate)</option>
                    <option value="advanced">ยาก (Advanced)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">จำนวนเซ็ตเริ่มต้น</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={exerciseFormData.default_sets}
                    onChange={(e) =>
                      setExerciseFormData({
                        ...exerciseFormData,
                        default_sets: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">จำนวนครั้งต่อเซ็ต</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={exerciseFormData.default_reps}
                    onChange={(e) =>
                      setExerciseFormData({
                        ...exerciseFormData,
                        default_reps: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  ไฟล์รูปภาพประกอบท่า (ส่งผ่าน API Private Bucket)
                </label>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setSelectedMediaFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-500/10 file:text-teal-400 hover:file:bg-teal-500/20"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsExerciseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold shadow-lg shadow-teal-950/40 disabled:opacity-50"
                >
                  บันทึกท่ากายภาพ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modpack Modal */}
      {isModpackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-teal-400" />
                <span>สร้างชุดท่าสำเร็จรูป (Modpack)</span>
              </h3>
              <button
                onClick={() => setIsModpackModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateModpack} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">ชื่อชุดท่า Modpack *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ชุดฟื้นฟูข้อเข่าระยะที่ 1 (Knee Rehab Pack A)"
                  value={modpackFormData.name}
                  onChange={(e) =>
                    setModpackFormData({ ...modpackFormData, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">คำอธิบาย</label>
                <input
                  type="text"
                  placeholder="เหมาะสำหรับผู้ป่วยหลังผ่าตัด 2 สัปดาห์แรก..."
                  value={modpackFormData.description}
                  onChange={(e) =>
                    setModpackFormData({ ...modpackFormData, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  เลือกท่ากายภาพที่ต้องการรวมในชุด ({modpackFormData.items.length} ท่าที่เลือก)
                </label>
                <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-800 rounded-2xl p-3 bg-slate-950">
                  {exercises.map((ex) => {
                    const isSelected = modpackFormData.items.some((i) => i.exercise_id === ex.id);
                    return (
                      <div
                        key={ex.id}
                        onClick={() => toggleExerciseInModpack(ex.id)}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition ${
                          isSelected
                            ? 'bg-teal-500/10 border-teal-500 text-teal-300'
                            : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-white">{ex.title}</div>
                          <div className="text-[11px] text-slate-500">{ex.target_joint}</div>
                        </div>
                        <div className="font-mono text-teal-400">
                          {isSelected ? '✓ เลือกแล้ว' : '+ คลิกเพื่อเลือก'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModpackModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold shadow-lg shadow-teal-950/40 disabled:opacity-50"
                >
                  สร้าง Modpack
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Question Modal */}
      {isQuestionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white">เพิ่มโจทย์คำถามมินิเกม</h3>
              <button
                onClick={() => setIsQuestionModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuestion} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">คำถาม / โจทย์ *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ข้อใดเป็นท่าบริหารที่ช่วยลดอาการปวดเข่า?"
                  value={questionFormData.prompt}
                  onChange={(e) =>
                    setQuestionFormData({ ...questionFormData, prompt: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              {[0, 1, 2, 3].map((idx) => (
                <div key={idx}>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    ตัวเลือกที่ {idx + 1} *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={`คำตอบตัวเลือกที่ ${idx + 1}`}
                    value={questionFormData.choices[idx]}
                    onChange={(e) => {
                      const updated = [...questionFormData.choices];
                      updated[idx] = e.target.value;
                      setQuestionFormData({ ...questionFormData, choices: updated });
                    }}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">คำตอบที่ถูกต้อง (เฉลย) *</label>
                <input
                  type="text"
                  required
                  placeholder="พิมพ์ข้อความที่ตรงกับตัวเลือกที่ถูกต้องเป๊ะๆ"
                  value={questionFormData.answer}
                  onChange={(e) =>
                    setQuestionFormData({ ...questionFormData, answer: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
                >
                  บันทึกโจทย์
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
          fetchData();
        }}
      />

      {/* Master Prompt v4: Smart Modpack Preset Builder Modal */}
      <SmartModpackModal
        isOpen={isSmartModpackModalOpen}
        onClose={() => setIsSmartModpackModalOpen(false)}
        onSuccess={() => {
          setIsSmartModpackModalOpen(false);
          fetchData();
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
          await fetchData();
        }}
      />
    </div>
  );
};
