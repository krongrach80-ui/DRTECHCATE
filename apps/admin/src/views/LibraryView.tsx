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
  Video,
  Calendar,
  Loader2,
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
import { PatientCoursePrescriptionModal } from '../clinical-ui/PatientCoursePrescriptionModal';
import { ALL_99_PHYSICAL_CARD_QUESTIONS } from '../../../kiosk/src/minigame-cards/index.js';
import { ALL_CLINICAL_EXERCISES } from '../../../../packages/pose-engine/src/index';

const DEMO_EXERCISES: ExerciseRecord[] = ALL_CLINICAL_EXERCISES.map((ex) => ({
  id: ex.id || 'ex-default',
  title: `${ex.nameTh} (${ex.nameEn} / ${ex.nameCn})`,
  description: ex.descriptionTh || '',
  target_joint: ex.targetJoint,
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
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState<boolean>(false);
  const [modpackToDelete, setModpackToDelete] = useState<ModpackRecord | null>(null);

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
  interface ExtendedQuestionRecord extends QuestionRecord {
    isBuiltIn?: boolean;
  }

  const [selectedMinigame, setSelectedMinigame] = useState<MinigameRecord | null>(null);
  const [questions, setQuestions] = useState<ExtendedQuestionRecord[]>([]);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState<boolean>(false);
  const [questionModalError, setQuestionModalError] = useState<string | null>(null);
  const [customQuestionCount, setCustomQuestionCount] = useState<number>(0);
  const [questionFormData, setQuestionFormData] = useState({
    prompt: '',
    choices: ['ใช่ (ยกมือซ้าย)', 'ไม่ (ยกมือขวา)'],
    answer: 'ใช่ (ยกมือซ้าย)',
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
  const [exerciseModalError, setExerciseModalError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [exData, mgData, mpData, customQuestions] = await Promise.all([
        defaultApiClient.exercises.list().catch(() => []),
        defaultApiClient.minigames.list().catch(() => []),
        defaultApiClient.modpacks.list().catch(() => []),
        defaultApiClient.minigames.listQuestions('mg-physical-cards').catch(() => []),
      ]);
      const filteredEx = Array.isArray(exData) ? exData.filter((e: any) => e.is_active !== false) : [];
      const safeEx = filteredEx.length > 0 ? filteredEx : DEMO_EXERCISES;
      const safeMg = Array.isArray(mgData) && mgData.length > 0 ? mgData : DEMO_MINIGAMES;
      const filteredMp = Array.isArray(mpData) ? mpData.filter((m: any) => m.is_active !== false) : [];
      const safeMp = Array.isArray(mpData) ? filteredMp : DEMO_MODPACKS;
      setExercises(safeEx);
      setMinigames(safeMg);
      setModpacks(safeMp);
      if (Array.isArray(customQuestions)) {
        setCustomQuestionCount(customQuestions.length);
      }
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

  const handleLibraryError = (err: unknown, defaultMessage: string) => {
    const msg = err instanceof Error ? err.message : String(err || defaultMessage);
    setErrorMsg(msg || defaultMessage);
  };

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    setExerciseModalError(null);
    setErrorMsg(null);

    const title = (exerciseFormData.title || '').trim();
    if (!title) {
      setExerciseModalError('กรุณากรอกชื่อท่ากายภาพ');
      return;
    }

    // Check duplicate title against existing active exercises
    const isDuplicate = exercises.some(
      (ex) => ex.title.trim().toLowerCase() === title.toLowerCase()
    );
    if (isDuplicate) {
      setExerciseModalError(`มีท่ากายภาพชื่อ "${title}" ในระบบแล้ว กรุณาใช้ชื่ออื่น`);
      return;
    }

    const sets = Number(exerciseFormData.default_sets);
    const reps = Number(exerciseFormData.default_reps);
    if (isNaN(sets) || sets < 1) {
      setExerciseModalError('จำนวนเซ็ตเริ่มต้นต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป');
      return;
    }
    if (isNaN(reps) || reps < 1) {
      setExerciseModalError('จำนวนครั้งต่อเซ็ตต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป');
      return;
    }

    try {
      setActionLoading(true);
      const payload = {
        ...exerciseFormData,
        title,
        default_sets: sets,
        default_reps: reps,
      };
      const created = await defaultApiClient.exercises.create(payload);
      if (selectedMediaFile && created.id) {
        try {
          await defaultApiClient.exercises.uploadMedia(created.id, selectedMediaFile);
        } catch {
          // Non-blocking media error
        }
      }

      const exerciseTitle = created.title || title;
      setSuccessMsg(`เพิ่มท่ากายภาพ "${exerciseTitle}" สำเร็จเรียบร้อย`);

      // Immediately prepend into state so tab count and card update instantaneously
      setExercises((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);

      setIsExerciseModalOpen(false);
      setSelectedMediaFile(null);
      setExerciseModalError(null);
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
      fetchData().catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถเพิ่มท่ากายภาพได้';
      setExerciseModalError(msg);
      handleLibraryError(err, 'ไม่สามารถเพิ่มท่ากายภาพได้');
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
      setSuccessMsg(`ลบท่ากายภาพ "${title}" เรียบร้อยแล้ว`);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถลบท่ากายภาพได้';
      setErrorMsg(msg);
      await fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const openMinigameQuestions = async (game: MinigameRecord) => {
    setSelectedMinigame(game);
    const isPhysicalCard = game.id === 'mg-physical-cards' || game.id === 'fa000000-0000-0000-0000-000000000003';

    try {
      const qList = await defaultApiClient.minigames.listQuestions(game.id);
      if (isPhysicalCard) {
        const builtInCards: ExtendedQuestionRecord[] = ALL_99_PHYSICAL_CARD_QUESTIONS.map((q) => ({
          id: q.id,
          prompt: `[${q.category}] ภาพ: ${q.imageDescription} — ${q.prompt}`,
          choices: ['ใช่ (ยกมือซ้าย)', 'ไม่ (ยกมือขวา)'],
          answer: q.correctAnswer === 'yes' ? 'ใช่ (ยกมือซ้าย)' : 'ไม่ (ยกมือขวา)',
          minigame_id: 'mg-physical-cards',
          isBuiltIn: true,
        }));
        const customMapped: ExtendedQuestionRecord[] = (Array.isArray(qList) ? qList : []).map((q) => ({
          ...q,
          isBuiltIn: false,
        }));
        setQuestions([...customMapped, ...builtInCards]);
        setCustomQuestionCount(customMapped.length);
      } else {
        const mapped: ExtendedQuestionRecord[] = (Array.isArray(qList) ? qList : []).map((q) => ({
          ...q,
          isBuiltIn: false,
        }));
        setQuestions(mapped);
      }
    } catch {
      if (isPhysicalCard) {
        const builtInCards: ExtendedQuestionRecord[] = ALL_99_PHYSICAL_CARD_QUESTIONS.map((q) => ({
          id: q.id,
          prompt: `[${q.category}] ภาพ: ${q.imageDescription} — ${q.prompt}`,
          choices: ['ใช่ (ยกมือซ้าย)', 'ไม่ (ยกมือขวา)'],
          answer: q.correctAnswer === 'yes' ? 'ใช่ (ยกมือซ้าย)' : 'ไม่ (ยกมือขวา)',
          minigame_id: 'mg-physical-cards',
          isBuiltIn: true,
        }));
        setQuestions(builtInCards);
      } else {
        setQuestions([]);
      }
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMinigame) return;
    setQuestionModalError(null);

    const prompt = (questionFormData.prompt || '').trim();
    if (!prompt) {
      setQuestionModalError('กรุณากรอกข้อความคำถาม / โจทย์');
      return;
    }

    const validChoices = (questionFormData.choices || []).map((c) => String(c).trim()).filter(Boolean);
    if (validChoices.length < 2) {
      setQuestionModalError('กรุณาระบุตัวเลือกคำตอบอย่างน้อย 2 ตัวเลือก');
      return;
    }

    const answer = (questionFormData.answer || '').trim();
    if (!answer) {
      setQuestionModalError('กรุณาระบุคำตอบที่ถูกต้อง (เฉลย)');
      return;
    }

    if (!validChoices.includes(answer)) {
      setQuestionModalError('คำตอบที่ถูกต้องต้องตรงกับหนึ่งในตัวเลือกที่ระบุ');
      return;
    }

    // Check duplicate in current loaded questions
    const isDup = questions.some(
      (q) => q.prompt.trim().toLowerCase() === prompt.toLowerCase()
    );
    if (isDup) {
      setQuestionModalError(`มีโจทย์ข้อความ "${prompt}" อยู่แล้วในมินิเกมนี้`);
      return;
    }

    try {
      setActionLoading(true);
      const res = await defaultApiClient.minigames.createQuestion(selectedMinigame.id, {
        prompt,
        choices: validChoices,
        answer,
      });

      if (!res || !res.id) {
        throw new Error('ไม่สามารถบันทึกโจทย์ได้: ไม่พบข้อมูลที่ยืนยันจากเซิร์ฟเวอร์');
      }

      setSuccessMsg('เพิ่มโจทย์มินิเกมเรียบร้อย');
      setIsQuestionModalOpen(false);
      const isPhysical = selectedMinigame.id === 'mg-physical-cards' || selectedMinigame.id === 'fa000000-0000-0000-0000-000000000003';
      setQuestionFormData({
        prompt: '',
        choices: isPhysical ? ['ใช่ (ยกมือซ้าย)', 'ไม่ (ยกมือขวา)'] : ['', '', '', ''],
        answer: isPhysical ? 'ใช่ (ยกมือซ้าย)' : '',
      });
      await openMinigameQuestions(selectedMinigame);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถเพิ่มโจทย์ได้';
      setQuestionModalError(msg);
      handleLibraryError(err, 'ไม่สามารถเพิ่มโจทย์ได้');
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
      handleLibraryError(err, 'ไม่สามารถลบโจทย์ได้');
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
      const created = await defaultApiClient.modpacks.create(modpackFormData);
      if (created && (created as any).id) {
        setModpacks((prev) => [(created as any), ...prev.filter((p) => p.id !== (created as any).id)]);
      }
      setSuccessMsg(`สร้างชุดท่ากายภาพ "${modpackFormData.name}" สำเร็จ`);
      setIsModpackModalOpen(false);
      setModpackFormData({ name: '', description: '', items: [] });
      await fetchData();
    } catch (err: unknown) {
      handleLibraryError(err, 'ไม่สามารถสร้างชุดท่าได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteModpack = (modpack: ModpackRecord) => {
    setModpackToDelete(modpack);
  };

  const handleConfirmDeleteModpack = async () => {
    if (!modpackToDelete) return;
    try {
      setActionLoading(true);
      await defaultApiClient.modpacks.delete(modpackToDelete.id);
      setSuccessMsg(`ลบชุดท่ากายภาพ "${modpackToDelete.name}" เรียบร้อย`);
      setModpackToDelete(null);
      await fetchData();
    } catch (err: unknown) {
      handleLibraryError(err, 'ไม่สามารถลบชุดท่าได้');
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
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 shadow-xs">
              <Dumbbell className="w-6 h-6" />
            </span>
            <span>คลังท่ากายภาพ มินิเกม และชุดท่า (Library)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            จัดการท่ากายภาพ อัปโหลดสื่อบันทึก ชุดท่าสำเร็จรูป (Modpack) และโจทย์มินิเกมฝึกสมอง
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsPrescriptionModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm transition shadow-md shadow-emerald-950/20 active:scale-95"
          >
            <Calendar className="w-4 h-4" />
            <span>👨‍⚕️ สั่งจ่ายคอร์สให้ผู้ป่วยรายคน</span>
          </button>
          {activeTab === 'exercises' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setSelectedExerciseForAi(null);
                  setIsCloneMode(false);
                  setIsExerciseBuilderOpen(true);
                }}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm transition shadow-md shadow-blue-950/20 active:scale-95"
              >
                <Video className="w-4 h-4" />
                <span>🎯 AI Pose Studio (Webcam)</span>
              </button>
              <button
                onClick={() => setIsSmartExerciseModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-blue-200 hover:bg-blue-50/80 text-blue-700 font-bold text-sm transition shadow-sm active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Smart Exercise Upload</span>
              </button>
              <button
                onClick={() => {
                  setExerciseModalError(null);
                  setIsExerciseModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-md shadow-emerald-950/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มท่ากายภาพใหม่</span>
              </button>
            </div>
          )}
          {activeTab === 'modpacks' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsSmartModpackModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-blue-200 hover:bg-blue-50/80 text-blue-700 font-bold text-sm transition shadow-sm active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Smart Modpack Builder</span>
              </button>
              <button
                onClick={() => setIsModpackModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-md shadow-emerald-950/20 active:scale-95"
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
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('exercises')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'exercises'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Dumbbell className="w-4 h-4 text-blue-600" />
          <span>ท่ากายภาพ ({exercises.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('modpacks')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'modpacks'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4 text-blue-600" />
          <span>ชุดท่า Modpacks ({modpacks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('minigames')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'minigames'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Gamepad2 className="w-4 h-4 text-blue-600" />
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
              exercises.map((ex) => {
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

                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                            <Dumbbell className="w-4 h-4" />
                          </span>
                          <h3 className="font-bold text-slate-900 text-base">{ex.title}</h3>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            ex.difficulty === 'easy' || ex.difficulty === 'beginner'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : ex.difficulty === 'medium' || ex.difficulty === 'intermediate'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {ex.difficulty === 'easy' || ex.difficulty === 'beginner'
                            ? 'BEGINNER'
                            : ex.difficulty === 'medium' || ex.difficulty === 'intermediate'
                            ? 'INTERMEDIATE'
                            : 'ADVANCED'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
                        {ex.default_hold_sec ? (
                          <span className="px-2 py-0.5 rounded-lg bg-teal-50 font-mono text-teal-700 border border-teal-200 text-[10px] font-semibold">
                            ค้าง {ex.default_hold_sec} วิ
                          </span>
                        ) : null}
                        {ex.default_duration_sec ? (
                          <span className="px-2 py-0.5 rounded-lg bg-blue-50 font-mono text-blue-700 border border-blue-200 text-[10px] font-semibold">
                            {ex.default_duration_sec} วิ/เซ็ต
                          </span>
                        ) : null}
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2">
                        {ex.description || 'ไม่มีคำอธิบาย'}
                      </p>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                        <div>
                          <span className="text-slate-500">ข้อต่อเป้าหมาย:</span>
                          <div className="font-semibold text-slate-800">{ex.target_joint || '-'}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">ค่าเริ่มต้น:</span>
                          <div className="font-bold text-emerald-700">
                            {ex.default_sets} เซ็ต × {ex.default_reps} ครั้ง
                          </div>
                        </div>
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

                    <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
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
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-400">ID: {ex.id.slice(0, 8)}...</span>
                        <button
                          onClick={() => handleDeleteExercise(ex.id, ex.title)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="ลบท่านี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
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
                  className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                          <Package className="w-4 h-4" />
                        </span>
                        <h3 className="font-bold text-slate-900 text-base">{mp.name}</h3>
                      </div>
                      <button
                        onClick={() => handleDeleteModpack(mp)}
                        disabled={actionLoading}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition disabled:opacity-50 cursor-pointer active:scale-95"
                        title="ลบชุดท่านี้"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-600">{mp.description || 'ไม่มีคำอธิบาย'}</p>

                    <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                      <div className="text-xs font-semibold text-slate-700 mb-1">
                        รายการท่าในชุด ({mp.items?.length || 0} ท่า):
                      </div>
                      {mp.items && mp.items.length > 0 ? (
                        mp.items.map((it, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs text-slate-700"
                          >
                            <span>
                              {idx + 1}. {it.exercise?.title || `Exercise ${it.exercise_id.slice(0, 6)}`}
                            </span>
                            <span className="font-mono text-emerald-700 font-bold">
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
            {minigames.map((game) => {
              const isPhysical = game.id === 'mg-physical-cards' || game.id === 'fa000000-0000-0000-0000-000000000003';
              const displayTitle = isPhysical
                ? `การ์ดกายภาพ (Physical Rehab Card Game - ${99 + customQuestionCount} ข้อ)`
                : game.title;
              return (
                <div
                  key={game.id}
                  onClick={() => openMinigameQuestions(game)}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                    selectedMinigame?.id === game.id
                      ? 'bg-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Gamepad2 className={`w-7 h-7 flex-shrink-0 ${selectedMinigame?.id === game.id ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div>
                      <h3 className="font-bold text-slate-900 text-base leading-snug">{displayTitle}</h3>
                      <p className={`text-xs mt-1 ${selectedMinigame?.id === game.id ? 'text-emerald-700 font-medium' : 'text-slate-600'}`}>
                        {game.description || 'มินิเกมฝึกสมอง'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedMinigame && (
            <div className="bg-white border border-blue-100 rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-blue-600" />
                    <span>
                      โจทย์คำถามสำหรับ:{' '}
                      {selectedMinigame.id === 'mg-physical-cards' || selectedMinigame.id === 'fa000000-0000-0000-0000-000000000003'
                        ? `การ์ดกายภาพ (Physical Rehab Card Game - ${99 + customQuestionCount} ข้อ)`
                        : selectedMinigame.title}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    คำถามจะถูกสุ่มแสดงให้คนไข้ตอบบนหน้าจอตู้ Kiosk ระหว่างฝึก
                  </p>
                </div>
                <button
                  onClick={() => {
                    setQuestionModalError(null);
                    const isPhysical = selectedMinigame.id === 'mg-physical-cards' || selectedMinigame.id === 'fa000000-0000-0000-0000-000000000003';
                    setQuestionFormData({
                      prompt: '',
                      choices: isPhysical ? ['ใช่ (ยกมือซ้าย)', 'ไม่ (ยกมือขวา)'] : ['', '', '', ''],
                      answer: isPhysical ? 'ใช่ (ยกมือซ้าย)' : '',
                    });
                    setIsQuestionModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
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
                      className={`p-4 rounded-xl border flex items-start justify-between ${
                        q.isBuiltIn
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-500/10'
                      }`}
                    >
                      <div className="space-y-2 flex-1 mr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-semibold text-slate-900">{q.prompt}</div>
                          {q.isBuiltIn ? (
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-200/70 px-2 py-0.5 rounded-md whitespace-nowrap">
                              โจทย์มาตรฐาน (99 ข้อ)
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md whitespace-nowrap">
                              โจทย์ใหม่ (คลินิก)
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {q.choices.map((c: string, idx: number) => (
                            <div
                              key={idx}
                              className={`px-3 py-1.5 rounded-lg border ${
                                c === q.answer
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              {idx + 1}. {c} {c === q.answer && '✓ (เฉลย)'}
                            </div>
                          ))}
                        </div>
                      </div>
                      {!q.isBuiltIn && (
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition shrink-0"
                          title="ลบโจทย์ที่เพิ่มเอง"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-blue-100 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-blue-600" />
                <span>เพิ่มท่ากายภาพใหม่</span>
              </h3>
              <button
                onClick={() => setIsExerciseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {exerciseModalError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{exerciseModalError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExerciseModalError(null)}
                  className="text-rose-400 hover:text-rose-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <form onSubmit={handleCreateExercise} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อท่ากายภาพ *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ยกดรายข้อเข่า (Straight Leg Raise)"
                  value={exerciseFormData.title}
                  onChange={(e) =>
                    setExerciseFormData({ ...exerciseFormData, title: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">คำอธิบายวิธีฝึก</label>
                <textarea
                  rows={2}
                  placeholder="นอนหงาย เกร็งกล้ามเนื้อหน้าขา ยกขาขึ้น 45 องศา ค้างไว้ 5 วินาที..."
                  value={exerciseFormData.description}
                  onChange={(e) =>
                    setExerciseFormData({ ...exerciseFormData, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ข้อต่อเป้าหมาย</label>
                  <input
                    type="text"
                    placeholder="เช่น knee, shoulder, lumbar"
                    value={exerciseFormData.target_joint}
                    onChange={(e) =>
                      setExerciseFormData({ ...exerciseFormData, target_joint: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ระดับความยาก</label>
                  <select
                    value={exerciseFormData.difficulty}
                    onChange={(e) =>
                      setExerciseFormData({
                        ...exerciseFormData,
                        difficulty: e.target.value as 'beginner' | 'intermediate' | 'advanced',
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="beginner">ง่าย (Beginner)</option>
                    <option value="intermediate">ปานกลาง (Intermediate)</option>
                    <option value="advanced">ยาก (Advanced)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">จำนวนเซ็ตเริ่มต้น</label>
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
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">จำนวนครั้งต่อเซ็ต</label>
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
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ไฟล์รูปภาพประกอบท่า (ส่งผ่าน API Private Bucket)
                </label>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setSelectedMediaFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsExerciseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-md shadow-emerald-950/20 disabled:opacity-50 transition active:scale-95"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-blue-100 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <span>สร้างชุดท่าสำเร็จรูป (Modpack)</span>
              </h3>
              <button
                onClick={() => setIsModpackModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateModpack} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อชุดท่า Modpack *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ชุดฟื้นฟูข้อเข่าระยะที่ 1 (Knee Rehab Pack A)"
                  value={modpackFormData.name}
                  onChange={(e) =>
                    setModpackFormData({ ...modpackFormData, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">คำอธิบาย</label>
                <input
                  type="text"
                  placeholder="เหมาะสำหรับผู้ป่วยหลังผ่าตัด 2 สัปดาห์แรก..."
                  value={modpackFormData.description}
                  onChange={(e) =>
                    setModpackFormData({ ...modpackFormData, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  เลือกท่ากายภาพที่ต้องการรวมในชุด ({modpackFormData.items.length} ท่าที่เลือก)
                </label>
                <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
                  {exercises.map((ex) => {
                    const isSelected = modpackFormData.items.some((i) => i.exercise_id === ex.id);
                    return (
                      <div
                        key={ex.id}
                        onClick={() => toggleExerciseInModpack(ex.id)}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-50 border-blue-400 text-blue-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{ex.title}</div>
                          <div className="text-[11px] text-slate-500">{ex.target_joint}</div>
                        </div>
                        <div className="font-mono text-emerald-700 font-bold">
                          {isSelected ? '✓ เลือกแล้ว' : '+ คลิกเพื่อเลือก'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModpackModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-md shadow-emerald-950/20 disabled:opacity-50 transition active:scale-95"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-blue-100 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-600" />
                <span>
                  เพิ่มโจทย์ใหม่: {selectedMinigame?.id === 'mg-physical-cards' || selectedMinigame?.id === 'fa000000-0000-0000-0000-000000000003' ? 'การ์ดกายภาพ' : selectedMinigame?.title}
                </span>
              </h3>
              <button
                onClick={() => setIsQuestionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {questionModalError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{questionModalError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuestionModalError(null)}
                  className="text-rose-400 hover:text-rose-600 ml-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleCreateQuestion} className="space-y-3.5">
              {Boolean(selectedMinigame?.id === 'mg-physical-cards' || selectedMinigame?.id === 'fa000000-0000-0000-0000-000000000003') && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>โหมดการ์ดกายภาพ: คนไข้จะตอบด้วยการยกมือซ้าย (ใช่) หรือขวา (ไม่) ผ่านกล้องตู้ Kiosk</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">คำถาม / โจทย์ *</label>
                <input
                  type="text"
                  required
                  placeholder={
                    selectedMinigame?.id === 'mg-physical-cards' || selectedMinigame?.id === 'fa000000-0000-0000-0000-000000000003'
                      ? 'เช่น การออกกำลังกายช่วยลดอาการข้อเข่าเสื่อมใช่หรือไม่?'
                      : 'เช่น ข้อใดเป็นท่าบริหารที่ช่วยลดอาการปวดเข่า?'
                  }
                  value={questionFormData.prompt}
                  onChange={(e) =>
                    setQuestionFormData({ ...questionFormData, prompt: e.target.value })
                  }
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                />
              </div>

              {Boolean(selectedMinigame?.id === 'mg-physical-cards' || selectedMinigame?.id === 'fa000000-0000-0000-0000-000000000003') ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        ตัวเลือก 1 (ยกมือซ้าย) *
                      </label>
                      <input
                        type="text"
                        required
                        value={questionFormData.choices[0] || 'ใช่ (ยกมือซ้าย)'}
                        onChange={(e) => {
                          const updated = [...questionFormData.choices];
                          updated[0] = e.target.value;
                          setQuestionFormData({ ...questionFormData, choices: updated });
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        ตัวเลือก 2 (ยกมือขวา) *
                      </label>
                      <input
                        type="text"
                        required
                        value={questionFormData.choices[1] || 'ไม่ (ยกมือขวา)'}
                        onChange={(e) => {
                          const updated = [...questionFormData.choices];
                          updated[1] = e.target.value;
                          setQuestionFormData({ ...questionFormData, choices: updated });
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">คำตอบที่ถูกต้อง (เฉลย) *</label>
                    <select
                      value={questionFormData.answer}
                      onChange={(e) =>
                        setQuestionFormData({ ...questionFormData, answer: e.target.value })
                      }
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-emerald-800 focus:outline-none focus:bg-white focus:border-emerald-500 cursor-pointer"
                    >
                      <option value={questionFormData.choices[0] || 'ใช่ (ยกมือซ้าย)'}>
                        ✓ ตอบ: {questionFormData.choices[0] || 'ใช่ (ยกมือซ้าย)'}
                      </option>
                      <option value={questionFormData.choices[1] || 'ไม่ (ยกมือขวา)'}>
                        ✓ ตอบ: {questionFormData.choices[1] || 'ไม่ (ยกมือขวา)'}
                      </option>
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  {[0, 1, 2, 3].map((idx) => (
                    <div key={idx}>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ตัวเลือกที่ {idx + 1} *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={`คำตอบตัวเลือกที่ ${idx + 1}`}
                        value={questionFormData.choices[idx] || ''}
                        onChange={(e) => {
                          const updated = [...questionFormData.choices];
                          updated[idx] = e.target.value;
                          setQuestionFormData({ ...questionFormData, choices: updated });
                        }}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                      />
                    </div>
                  ))}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">คำตอบที่ถูกต้อง (เฉลย) *</label>
                    <input
                      type="text"
                      required
                      placeholder="พิมพ์ข้อความที่ตรงกับตัวเลือกที่ถูกต้องเป๊ะๆ"
                      value={questionFormData.answer}
                      onChange={(e) =>
                        setQuestionFormData({ ...questionFormData, answer: e.target.value })
                      }
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  {actionLoading ? 'กำลังบันทึก...' : 'บันทึกโจทย์'}
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

      {/* Patient Course Prescription Modal */}
      <PatientCoursePrescriptionModal
        isOpen={isPrescriptionModalOpen}
        onClose={() => setIsPrescriptionModalOpen(false)}
        onSuccess={() => {
          fetchData();
        }}
      />

      {/* Clinical Modpack Delete Confirmation Modal */}
      {modpackToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/60">
              <div className="flex items-center gap-2.5 text-rose-700">
                <div className="p-2 bg-rose-100 rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-rose-950">ยืนยันการลบชุดท่ากายภาพ</h3>
                  <p className="text-xs text-rose-700/80">Delete Clinical Modpack</p>
                </div>
              </div>
              <button
                onClick={() => !actionLoading && setModpackToDelete(null)}
                disabled={actionLoading}
                className="text-slate-400 hover:text-slate-600 transition disabled:opacity-50 cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                <div className="text-xs text-slate-500 font-medium">ชื่อชุดท่ากายภาพ (Modpack Name):</div>
                <div className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{modpackToDelete.name}</span>
                </div>
                {modpackToDelete.description && (
                  <p className="text-xs text-slate-600 pt-1 border-t border-slate-200/60">
                    {modpackToDelete.description}
                  </p>
                )}
                <div className="text-xs text-slate-600 flex items-center gap-1.5 pt-1">
                  <span className="font-semibold text-slate-700">จำนวนท่าในชุด:</span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold font-mono">
                    {modpackToDelete.items?.length || 0} ท่า
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-600 bg-amber-50/80 border border-amber-200 rounded-xl p-3 leading-relaxed">
                <span className="font-semibold text-amber-900">คำเตือนทางคลินิก:</span> การลบชุดท่านี้จะไม่ลบท่ามาตรฐาน 15 ท่าในคลังท่าหลัก และหากมีคอร์สคนไข้กำลังใช้งานอยู่ระบบจะไม่อนุญาตให้ลบ
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModpackToDelete(null)}
                disabled={actionLoading}
                className="h-10 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                ยกเลิก (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteModpack}
                disabled={actionLoading}
                className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition disabled:opacity-50 shadow-sm shadow-rose-600/30 cursor-pointer"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังลบ...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>ยืนยันลบชุดท่า</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
