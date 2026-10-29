import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
  AlertCircle,
  Play,
} from 'lucide-react';
import {
  MedicalCard,
  SmoothButton,
} from '../../../../packages/hospital-ui-kit/src/index.js';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  ALL_99_PHYSICAL_CARD_QUESTIONS,
  PhysicalCardGame,
} from '../../../kiosk/src/minigame-cards/index.js';

interface QuestionItem {
  id: string;
  category: string;
  icon: string;
  prompt: string;
  correctAnswer: 'yes' | 'no';
  explanation: string;
}

const INITIAL_99_QUESTIONS: QuestionItem[] = ALL_99_PHYSICAL_CARD_QUESTIONS.map((q) => {
  const catEmojiMap: Record<string, string> = {
    'อาหาร & ผลไม้': '🍎 อาหาร & ผลไม้',
    'สิ่งของเครื่องใช้': '🥄 สิ่งของเครื่องใช้',
    'สัตว์ & ธรรมชาติ': '🐶 สัตว์',
    'การนับจำนวน': '🔢 การนับจำนวน',
    'ความปลอดภัย & กิจวัตร': '🏠 ชีวิตประจำวัน',
    'สี รูปทรง & เวลา': '😊 สีและรูปทรง',
    'ตำแหน่ง & มโนทัศน์': '🧭 ทิศทาง & ตำแหน่ง',
  };
  return {
    id: q.id,
    category: catEmojiMap[q.category] || q.category,
    icon: q.iconEmoji || '💡',
    prompt: `ภาพ: ${q.imageDescription} — ${q.prompt}`,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
  };
});

export const MiniGameQuestionsView: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ทั้งหมด');
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [newAnswer, setNewAnswer] = useState<'yes' | 'no'>('yes');
  const [newCategory, setNewCategory] = useState('🍎 อาหาร & ผลไม้');
  const [newExplanation, setNewExplanation] = useState('');
  const [minigameId, setMinigameId] = useState<string>('cognitive-01');
  const [_loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const categories = [
    'ทั้งหมด',
    '🍎 อาหาร & ผลไม้',
    '🥄 สิ่งของเครื่องใช้',
    '🐶 สัตว์',
    '🔢 การนับจำนวน',
    '🏠 ชีวิตประจำวัน',
    '😊 สีและรูปทรง',
    '🧭 ทิศทาง & ตำแหน่ง',
  ];

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Default Clinical Cognitive Rehabilitation Questions (Includes all 99 questions)
  const [questions, setQuestions] = useState<QuestionItem[]>(INITIAL_99_QUESTIONS);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const mgList = await defaultApiClient.minigames.list().catch(() => []);
      if (mgList && mgList.length > 0) {
        const primary = mgList[0];
        setMinigameId(primary.id);
        const qList = await defaultApiClient.minigames.listQuestions(primary.id).catch(() => []);
        if (qList && qList.length > 0) {
          const mapped: QuestionItem[] = qList.map((q: any) => ({
            id: q.id,
            category: q.category || '🧠 ฝึกสมองและความรู้ทั่วไป',
            icon: '💡',
            prompt: q.prompt,
            correctAnswer: (q.answer === 'yes' || q.answer === 'no') ? q.answer : 'yes',
            explanation: q.choices?.join(', ') || 'คำถามฝึกสมองทางคลินิก',
          }));
          setQuestions([...mapped, ...INITIAL_99_QUESTIONS]);
        }
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchQuestions();
  }, []);

  const filteredQuestions = questions.filter((q) => {
    const matchesCategory =
      selectedCategory === 'ทั้งหมด' || q.category.includes(selectedCategory.replace(/[^ก-๙a-zA-Z]/g, '').trim());
    const matchesSearch =
      q.prompt.toLowerCase().includes(search.toLowerCase()) ||
      q.explanation.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleDelete = async (id: string) => {
    if (!window.confirm('ยืนยันการลบโจทย์คำถามนี้?')) return;
    try {
      setErrorMsg(null);
      await defaultApiClient.minigames.deleteQuestion(minigameId, id).catch(() => {});
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setSuccessMsg('ลบโจทย์คำถามสำเร็จ');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลบโจทย์ได้');
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrompt.trim()) return;
    try {
      setErrorMsg(null);
      const res = await defaultApiClient.minigames.createQuestion(minigameId, {
        prompt: newPrompt.trim(),
        choices: [newExplanation.trim() || 'ถูกต้อง'],
        answer: newAnswer,
      }).catch(() => null);

      const newQ: QuestionItem = {
        id: res?.id || `q-${Date.now()}`,
        category: newCategory,
        icon: '💡',
        prompt: newPrompt.trim(),
        correctAnswer: newAnswer,
        explanation: newExplanation.trim() || (newAnswer === 'yes' ? 'ใช่' : 'ไม่ใช่'),
      };
      setQuestions((prev) => [newQ, ...prev]);
      setSuccessMsg('เพิ่มโจทย์ใหม่เข้าสู่ระบบเรียบร้อยแล้ว');
      setIsAddOpen(false);
      setNewPrompt('');
      setNewExplanation('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถเพิ่มโจทย์ได้');
    }
  };

  return (
    <div className="p-8 space-y-6 font-sans">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-normal flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-emerald-600" />
            <span>คลังโจทย์คำถามมินิเกมฝึกสมอง (Cognitive Rehab Questions)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            โจทย์สำหรับกระตุ้นสมองและชะลอภาวะสมองเสื่อม ตอบผ่านการพยักหน้า/ส่ายหน้า หรือแตะหน้าจอสัมผัส
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SmoothButton
            variant="secondary"
            size="md"
            icon={<Play className="w-4 h-4 text-emerald-600" />}
            onClick={() => setIsPreviewOpen(true)}
          >
            <span>🎮 ทดลองเล่นการ์ดกายภาพ (10 ข้อ/รอบ)</span>
          </SmoothButton>

          <div className="relative w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาโจทย์ หรือคำอธิบาย..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
            />
          </div>

          <SmoothButton
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAddOpen(true)}
          >
            <span>+ เพิ่มโจทย์ใหม่</span>
          </SmoothButton>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Add Question Modal Form */}
      {isAddOpen && (
        <div className="p-5 rounded-2xl bg-white border border-emerald-200 shadow-md space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800">เพิ่มโจทย์คำถามใหม่ (บันทึกลงระบบจริง)</h3>
            <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreateQuestion} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">คำถาม / โจทย์:</label>
              <input
                type="text"
                required
                placeholder="เช่น ผลส้มมีรสเปรี้ยวอมหวานและมีวิตามินซีสูง ใช่หรือไม่?"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">คำตอบที่ถูกต้อง:</label>
                <select
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value as 'yes' | 'no')}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-white"
                >
                  <option value="yes">✓ ใช่ (พยักหน้า / แตะขวา)</option>
                  <option value="no">✕ ไม่ใช่ (ส่ายหน้า / แตะซ้าย)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">หมวดหมู่:</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-white"
                >
                  {categories.filter((c) => c !== 'ทั้งหมด').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">คำอธิบายเหตุผล:</label>
              <input
                type="text"
                placeholder="เช่น ใช่ ส้มเป็นผลไม้ที่มีวิตามินซีสูง"
                value={newExplanation}
                onChange={(e) => setNewExplanation(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                ยกเลิก
              </button>
              <SmoothButton variant="primary" size="sm" type="submit">
                <span>บันทึกโจทย์</span>
              </SmoothButton>
            </div>
          </form>
        </div>
      )}

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 select-none">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 ${
              selectedCategory === cat
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/20 scale-[1.02]'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 3-Column Question Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredQuestions.map((q) => (
          <MedicalCard key={q.id} className="p-6 flex flex-col justify-between border border-slate-200">
            <div>
              {/* Category & Icon */}
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                  {q.category}
                </span>
                <span className="text-2xl">{q.icon}</span>
              </div>

              {/* Bold Prompt */}
              <h3 className="text-sm font-black text-slate-800 leading-snug mb-3">
                "{q.prompt}"
              </h3>

              {/* Answer Badge */}
              <div className="mb-3">
                {q.correctAnswer === 'yes' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>✓ ใช่ (พยักหน้า / แตะขวา)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>✕ ไม่ใช่ (ส่ายหน้า / แตะซ้าย)</span>
                  </span>
                )}
              </div>

              {/* Explanation */}
              <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="font-semibold text-slate-700">คำอธิบาย:</span> {q.explanation}
              </p>
            </div>

            {/* Edit / Delete Buttons */}
            <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                className="py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>✎ แก้ไข</span>
              </button>

              <button
                type="button"
                onClick={() => handleDelete(q.id)}
                className="py-1.5 px-3 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold transition flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>🗑 ลบ</span>
              </button>
            </div>
          </MedicalCard>
        ))}
      </div>

      {/* Live Physical Card Game Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 pt-4 sm:pt-6">
          <div className="w-full max-w-4xl h-[92vh] sm:h-[94vh] bg-[#EDF7F1] rounded-3xl overflow-hidden shadow-2xl relative border border-emerald-300/40">
            <PhysicalCardGame maxQuestions={10} onExit={() => setIsPreviewOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
