/**
 * packages/hospital-ui-kit/src/VoiceFeedbackController.ts
 *
 * VOICE & AUDIO COOLDOWN GUARD (SaMD Class II & 24/7 Kiosk Stability)
 *
 * 1. Cooldown Guard: Enforces a minimum cooldown of >= 3,500ms per message type/content,
 *    preventing overlapping Thai speech chatter or audio buffer pileup.
 * 2. Instant Queue Purge: window.speechSynthesis.cancel() immediately flushes pending utterances.
 * 3. Strict Resource Disposal: Cancels ongoing speech and releases resources on session end or emergency stop.
 */

export interface VoiceFeedbackOptions {
  minCooldownMs?: number; // default: 3,500 ms
  lang?: string; // default: 'th-TH' (supports 'zh-CN', 'en-US')
  rate?: number; // default: 1.05
}

const COACHING_TRANSLATIONS: Record<string, Record<string, string>> = {
  lean_forward: {
    'zh-CN': '请身体稍微前倾，让肩膀自然下垂',
    'th-TH': 'โน้มตัวไปข้างหน้าเล็กน้อย ให้หัวไหล่ผ่อนคลาย',
    'en-US': 'Please lean slightly forward and let your shoulders relax',
  },
  keep_arm_straight: {
    'zh-CN': '请放松手臂自然下垂，不要弯曲手肘',
    'th-TH': 'เหยียดแขนตรงและผ่อนคลาย อย่าเกร็งข้อศอก',
    'en-US': 'Keep your arm straight and relaxed, do not bend your elbow',
  },
  raised_too_high: {
    'zh-CN': '抬得太高了，请慢慢放下以确保安全',
    'th-TH': 'ยกแขนสูงเกินไป ค่อยๆ ผ่อนระดับลงเพื่อความปลอดภัย',
    'en-US': 'Raised too high, please lower slowly for safety',
  },
  avoid_tilt_shrug: {
    'zh-CN': '请保持身体直立，放松肩膀，不要耸肩',
    'th-TH': 'รักษาลำตัวให้ตรง ผ่อนคลายหัวไหล่ อย่าเกร็งยักไหล่',
    'en-US': 'Keep your body upright, relax your shoulders and avoid shrugging',
  },
  slow_down: {
    'zh-CN': '请放慢动作，保持均匀节奏',
    'th-TH': 'เคลื่อนไหวให้ช้าลงและรักษาระดับจังหวะให้สม่ำเสมอ',
    'en-US': 'Please slow down and maintain a steady pace',
  },
};

export class VoiceFeedbackController {
  private minCooldownMs: number;
  private lang: string;
  private rate: number;
  private lastSpokenTimes: Map<string, number> = new Map();

  constructor(options: VoiceFeedbackOptions = {}) {
    this.minCooldownMs = options.minCooldownMs ?? 3500;
    this.rate = options.rate ?? 1.05;

    let initialLang = options.lang ?? 'th-TH';
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('drtech_lang');
        if (saved) initialLang = saved;
        window.addEventListener('drtech:lang_change', (e: Event) => {
          const detail = (e as CustomEvent<string>).detail;
          if (detail) this.setLanguage(detail);
        });
      } catch {
        // safe fallback
      }
    }
    this.lang = initialLang;
  }

  public setLanguage(lang: string): void {
    this.lang = lang;
  }

  public getLanguage(): string {
    return this.lang;
  }

  /**
   * Speaks text with automatic category cooldown, translation support, and queue purge
   * @param text The speech string (or fallback text)
   * @param category Optional grouping key (e.g., 'rep_count', 'lean_forward', 'keep_arm_straight', 'slow_down')
   * @param overrideCooldownMs Optional custom cooldown threshold in milliseconds
   * @returns true if spoken, false if suppressed by cooldown
   */
  public speak(
    text: string,
    category?: string,
    overrideCooldownMs?: number
  ): boolean {
    const key = category || text;
    const now = Date.now();
    const cooldown = overrideCooldownMs ?? this.minCooldownMs;
    const lastSpoken = this.lastSpokenTimes.get(key) || 0;

    if (now - lastSpoken < cooldown) {
      return false; // Suppressed by cooldown guard
    }

    this.lastSpokenTimes.set(key, now);

    // Resolve localized text if key exists in dictionary
    let spokenText = text;
    if (category && COACHING_TRANSLATIONS[category]) {
      const translation = COACHING_TRANSLATIONS[category][this.lang];
      if (translation) {
        spokenText = translation;
      }
    }

    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
        // Immediate queue flush to prevent queue pileup
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.lang = this.lang;
        utterance.rate = this.rate;
        window.speechSynthesis.speak(utterance);
        return true;
      }
    } catch {
      // Safe fallback if speech synthesis is disabled or unavailable
    }

    return false;
  }

  /**
   * Immediately stops any active or queued speech
   */
  public cancel(): void {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // safe fallback
    }
  }

  /**
   * Resets cooldown histories and clears queue
   */
  public reset(): void {
    this.lastSpokenTimes.clear();
    this.cancel();
  }
}

// Global singleton instance for easy reuse across views
export const defaultVoiceFeedbackController = new VoiceFeedbackController();

