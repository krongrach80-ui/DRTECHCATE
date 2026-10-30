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
  lang?: string; // default: 'th-TH'
  rate?: number; // default: 1.05
}

export class VoiceFeedbackController {
  private minCooldownMs: number;
  private lang: string;
  private rate: number;
  private lastSpokenTimes: Map<string, number> = new Map();

  constructor(options: VoiceFeedbackOptions = {}) {
    this.minCooldownMs = options.minCooldownMs ?? 3500;
    this.lang = options.lang ?? 'th-TH';
    this.rate = options.rate ?? 1.05;
  }

  /**
   * Speaks Thai text with automatic category cooldown and queue purge
   * @param text The Thai speech string
   * @param category Optional grouping key (e.g., 'rep_count', 'coaching', 'hold_pause', 'error')
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

    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
        // Immediate queue flush to prevent queue pileup
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
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
