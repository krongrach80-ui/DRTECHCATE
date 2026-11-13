/**
 * packages/smart-biometric-core/src/biometricConfig.ts
 * ศูนย์กลางการกำหนดค่าความปลอดภัยชีวมาตร (Biometric Security Configuration)
 * Conforms to US NIST SP 800-63B + Thailand PDPA + Hospital-Grade Identity Verification
 */

const readNumericEnv = (key: string, fallback: number): number => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
      const parsed = Number(process.env[key]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Browser-safe fallback
  }
  return fallback;
};

/** Euclidean Distance threshold for 1:N face login matching (configurable via FACE_MATCH_THRESHOLD, default 0.45) */
export const MATCH_THRESHOLD = readNumericEnv('FACE_MATCH_THRESHOLD', 0.45);

/** Minimum distance/margin gap between top-1 and runner-up account (configurable via FACE_MIN_MARGIN, default 0.08) */
export const MIN_MARGIN = readNumericEnv('FACE_MIN_MARGIN', 0.08);

/** Consecutive matching frames required for the exact same account before granting login (default 3 out of 5) */
export const REQUIRED_CONSECUTIVE_FRAMES = readNumericEnv('FACE_REQUIRED_CONSECUTIVE_FRAMES', 3);

/** Sliding frame window size for consecutive frame verification */
export const CONSECUTIVE_FRAME_WINDOW = readNumericEnv('FACE_CONSECUTIVE_FRAME_WINDOW', 5);

export const BIOMETRIC_CONFIG = {
  /** จำนวนเฟรมชีวมาตรที่ต้องเก็บและเฉลี่ยเวกเตอร์ที่ผ่าน Liveness ก่อนส่งเทียบ (อย่างน้อย 8 เฟรม) */
  FRAMES_PER_SCAN: 8,

  /** ค่าระยะห่าง Euclidean สูงสุดที่ยอมรับว่าเป็นคนเดียวกัน (ต่ำกว่า 0.38 เท่านั้น) */
  MAX_EUCLIDEAN_DISTANCE: 0.38,

  /** ค่าระยะห่างเข้มงวดพิเศษกรณีในฐานข้อมูลมีผู้ป่วยเพียงคนเดียว เพื่อป้องกันคนอื่นสวมสิทธิ์ (ต่ำกว่า 0.32) */
  SINGLE_USER_STRICT_DISTANCE: 0.32,

  /** ค่าความคล้ายคลึง Cosine Similarity ขั้นต่ำแท้จริง (ห้ามบวกคะแนนช่วย ต้อง >= 0.85) */
  MIN_COSINE_SIMILARITY: 0.85,

  /** ส่วนต่างความคล้ายคลึงขั้นต่ำระหว่าง Candidate อันดับ 1 กับ อันดับ 2 */
  /** หากมีคนเดียวในระบบ หรือส่วนต่างน้อยกว่านี้ ให้ถือว่า 'ไม่แน่ใจ (Ambiguous)' และบังคับยืนยัน PIN */
  MARGIN_MIN: 0.08,

  /** จำนวนครั้งที่อนุญาตให้สแกนหรือยืนยันตัวตนผิดพลาดติดต่อกัน (5 ครั้ง) */
  MAX_ATTEMPTS: 5,

  /** ระยะเวลาล็อกการสแกนชั่วคราวเมื่อทำผิดเกินโควตา (60 วินาที) */
  LOCKOUT_DURATION_MS: 60_000,

  /** ความถี่ในการดึงเฟรมและตรวจสอบ Liveness (200 มิลลิวินาที) */
  FRAME_INTERVAL_MS: 200,

  /** ค่า Eye Aspect Ratio (EAR) ขั้นต่ำที่ถือว่ากำลังหลับตา/กะพริบตา */
  BLINK_EAR_CLOSED: 0.20,

  /** ค่า EAR ขั้นต่ำที่ถือว่าลืมตากลับมาตามปกติหลังกะพริบตา */
  BLINK_EAR_OPEN: 0.26,

  /** การเปลี่ยนแปลงของมุมศีรษะขั้นต่ำ (องศา) สำหรับ Motion Liveness */
  MIN_HEAD_MOTION_DEGREES: 8.0,

  /** ระยะเวลาตรวจสอบความมีชีวิตขั้นต่ำก่อนอนุญาตให้เริ่มการเทียบ (มิลลิวินาที) */
  MIN_LIVENESS_DURATION_MS: 1200,
} as const;

