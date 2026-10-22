import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Phase 3: User Management & Role Schema Validation', () => {
  const createUserSchema = z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(12),
    full_name: z.string().min(1),
    role: z.enum(['admin', 'pt', 'patient']),
    license_no: z.string().optional().nullable(),
  });

  it('rejects passwords shorter than 12 characters', () => {
    const invalid = createUserSchema.safeParse({
      username: 'doctor_somchai',
      password: 'shortpass', // 9 chars
      full_name: 'นายแพทย์ สมชาย',
      role: 'admin',
    });
    expect(invalid.success).toBe(false);

    const valid = createUserSchema.safeParse({
      username: 'doctor_somchai',
      password: 'StrongPassword123!', // 18 chars
      full_name: 'นายแพทย์ สมชาย',
      role: 'admin',
    });
    expect(valid.success).toBe(true);
  });

  it('rejects invalid usernames containing special symbols or spaces', () => {
    const invalid = createUserSchema.safeParse({
      username: 'doctor somchai@!',
      password: 'StrongPassword123!',
      full_name: 'นายแพทย์ สมชาย',
      role: 'admin',
    });
    expect(invalid.success).toBe(false);
  });
});

describe('Phase 3: 10-Frame Face Enrollment Sequence & Consistency Rules', () => {
  const frameSchema = z.object({
    pose: z.enum(['front', 'left', 'right', 'nod']),
    embedding: z.array(z.number()).length(128),
  });

  function validateSequence(frames: { pose: string }[]): boolean {
    if (frames.length !== 10) return false;
    const front = frames.filter((f) => f.pose === 'front').length;
    const left = frames.filter((f) => f.pose === 'left').length;
    const right = frames.filter((f) => f.pose === 'right').length;
    const nod = frames.filter((f) => f.pose === 'nod').length;
    return front === 4 && left === 2 && right === 2 && nod === 2;
  }

  function euclideanDistance(v1: number[], v2: number[]): number {
    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      const diff = v1[i] - v2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  it('strictly enforces 4 front, 2 left, 2 right, 2 nod sequence', () => {
    const validFrames = [
      { pose: 'front' }, { pose: 'front' }, { pose: 'front' }, { pose: 'front' },
      { pose: 'left' }, { pose: 'left' },
      { pose: 'right' }, { pose: 'right' },
      { pose: 'nod' }, { pose: 'nod' },
    ];
    expect(validateSequence(validFrames)).toBe(true);

    const invalidFrames = [
      { pose: 'front' }, { pose: 'front' }, { pose: 'front' },
      { pose: 'left' }, { pose: 'left' }, { pose: 'left' },
      { pose: 'right' }, { pose: 'right' },
      { pose: 'nod' }, { pose: 'nod' },
    ];
    expect(validateSequence(invalidFrames)).toBe(false);
  });

  it('detects inconsistency across front face embeddings', () => {
    const consistentVectorA = Array(128).fill(0.1);
    const consistentVectorB = Array(128).fill(0.105);
    const distConsistent = euclideanDistance(consistentVectorA, consistentVectorB);
    expect(distConsistent).toBeLessThan(0.45);

    const inconsistentVectorC = Array(128).fill(0.9);
    const distInconsistent = euclideanDistance(consistentVectorA, inconsistentVectorC);
    expect(distInconsistent).toBeGreaterThan(0.45);
  });
});

describe('Phase 3: Module 4 Weekly Course Randomizer & State Isolation', () => {
  it('generates schedule only for specified days and weeks', () => {
    const startDate = '2026-11-02'; // Monday
    const durationWeeks = 2;
    const selectedDays = [1, 3, 5]; // Mon, Wed, Fri
    const exercisePool = ['ex-1', 'ex-2', 'ex-3'];

    const items: { scheduled_date: string; exercise_id: string }[] = [];
    const startDateObj = new Date(startDate);
    const totalDays = durationWeeks * 7;

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
      const curDate = new Date(startDateObj);
      curDate.setDate(startDateObj.getDate() + dayOffset);

      if (selectedDays.includes(curDate.getDay())) {
        const dateStr = curDate.toISOString().split('T')[0];
        const chosen = exercisePool[Math.floor(Math.random() * exercisePool.length)];
        items.push({ scheduled_date: dateStr, exercise_id: chosen });
      }
    }

    // 2 weeks * 3 days/week = exactly 6 sessions
    expect(items).toHaveLength(6);

    // Verify all selected days are Mon, Wed, or Fri
    for (const item of items) {
      const day = new Date(item.scheduled_date).getDay();
      expect([1, 3, 5]).toContain(day);
      expect(exercisePool).toContain(item.exercise_id);
    }
  });
});
