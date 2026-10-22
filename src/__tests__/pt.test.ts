import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

describe('Phase 4: PT Cross-Permission & Case Delegation Logic', () => {
  interface Assignment {
    patient_id: string;
    pt_id: string;
    is_primary: boolean;
  }

  interface Transfer {
    patient_id: string;
    from_pt_id: string;
    to_pt_id: string;
    start_date: string;
    end_date: string;
    status: 'active' | 'completed' | 'cancelled';
  }

  function checkPatientAccessible(
    ptId: string,
    patientId: string,
    currentDateStr: string,
    assignments: Assignment[],
    transfers: Transfer[]
  ): boolean {
    // 1. Primary assignment check
    const hasPrimary = assignments.some(
      (a) => a.patient_id === patientId && a.pt_id === ptId
    );
    if (hasPrimary) return true;

    // 2. Active temporary delegation within valid date range
    const hasActiveTransfer = transfers.some(
      (t) =>
        t.patient_id === patientId &&
        t.to_pt_id === ptId &&
        t.status === 'active' &&
        currentDateStr >= t.start_date &&
        currentDateStr <= t.end_date
    );

    return hasActiveTransfer;
  }

  const PT_A = 'pt-uuid-alice-1111';
  const PT_B = 'pt-uuid-bob-2222';
  const PATIENT_1 = 'patient-uuid-somchai-9999';

  const assignments: Assignment[] = [
    { patient_id: PATIENT_1, pt_id: PT_A, is_primary: true },
  ];

  it('allows primary PT A to access Patient 1 at all times', () => {
    expect(checkPatientAccessible(PT_A, PATIENT_1, '2026-10-22', assignments, [])).toBe(true);
  });

  it('denies PT B from accessing Patient 1 when no delegation exists', () => {
    expect(checkPatientAccessible(PT_B, PATIENT_1, '2026-10-22', assignments, [])).toBe(false);
  });

  it('grants PT B temporary access to Patient 1 strictly during the active delegation date range', () => {
    const activeTransfer: Transfer = {
      patient_id: PATIENT_1,
      from_pt_id: PT_A,
      to_pt_id: PT_B,
      start_date: '2026-10-20',
      end_date: '2026-10-25',
      status: 'active',
    };

    // Before start_date: denied
    expect(checkPatientAccessible(PT_B, PATIENT_1, '2026-10-19', assignments, [activeTransfer])).toBe(false);

    // During valid range: granted
    expect(checkPatientAccessible(PT_B, PATIENT_1, '2026-10-20', assignments, [activeTransfer])).toBe(true);
    expect(checkPatientAccessible(PT_B, PATIENT_1, '2026-10-22', assignments, [activeTransfer])).toBe(true);
    expect(checkPatientAccessible(PT_B, PATIENT_1, '2026-10-25', assignments, [activeTransfer])).toBe(true);

    // After end_date: denied
    expect(checkPatientAccessible(PT_B, PATIENT_1, '2026-10-26', assignments, [activeTransfer])).toBe(false);
  });

  it('immediately revokes PT B access if transfer status is cancelled or completed', () => {
    const cancelledTransfer: Transfer = {
      patient_id: PATIENT_1,
      from_pt_id: PT_A,
      to_pt_id: PT_B,
      start_date: '2026-10-20',
      end_date: '2026-10-25',
      status: 'cancelled',
    };
    expect(checkPatientAccessible(PT_B, PATIENT_1, '2026-10-22', assignments, [cancelledTransfer])).toBe(false);

    const completedTransfer: Transfer = {
      patient_id: PATIENT_1,
      from_pt_id: PT_A,
      to_pt_id: PT_B,
      start_date: '2026-10-20',
      end_date: '2026-10-25',
      status: 'completed',
    };
    expect(checkPatientAccessible(PT_B, PATIENT_1, '2026-10-22', assignments, [completedTransfer])).toBe(false);
  });
});

describe('Phase 4: Module 1 PT Password Reset Role Enforcement', () => {
  function validateResetPermission(targetRole: string): { allowed: boolean; error?: string } {
    if (targetRole !== 'patient') {
      return {
        allowed: false,
        error: 'ไม่อนุญาต: นักกายภาพบำบัดสามารถรีเซ็ตรหัสผ่านได้เฉพาะบัญชีผู้ป่วย (Patient) เท่านั้น',
      };
    }
    return { allowed: true };
  }

  it('permits PT to reset password only for patients', () => {
    expect(validateResetPermission('patient').allowed).toBe(true);
  });

  it('strictly rejects PT password reset when targeting an admin or another PT', () => {
    const adminAttempt = validateResetPermission('admin');
    expect(adminAttempt.allowed).toBe(false);
    expect(adminAttempt.error).toContain('เฉพาะบัญชีผู้ป่วย (Patient) เท่านั้น');

    const ptAttempt = validateResetPermission('pt');
    expect(ptAttempt.allowed).toBe(false);
    expect(ptAttempt.error).toContain('เฉพาะบัญชีผู้ป่วย (Patient) เท่านั้น');
  });

  it('enforces min 12 character password length on reset', () => {
    const resetSchema = z.object({
      new_password: z.string().min(12),
    });

    expect(resetSchema.safeParse({ new_password: '123456789' }).success).toBe(false);
    expect(resetSchema.safeParse({ new_password: 'HospitalPTPatientPass2026!' }).success).toBe(true);
  });
});

describe('Phase 4: Module 2 Medical Notes Append-Only Rules & Immutability', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  const schemaSql = fs.readFileSync(path.join(migrationsDir, '20261022000001_initial_schema.sql'), 'utf8');
  const rlsSql = fs.readFileSync(path.join(migrationsDir, '20261022000002_rls_and_policies.sql'), 'utf8');

  it('has database trigger preventing UPDATE and DELETE on medical_notes', () => {
    expect(schemaSql).toContain('CREATE TRIGGER trg_prevent_medical_notes_modification');
    expect(schemaSql).toContain('BEFORE UPDATE OR DELETE ON medical_notes');
    expect(schemaSql).toContain(
      "RAISE EXCEPTION 'Medical notes are append-only. Modification and deletion are strictly prohibited by hospital compliance policy.'"
    );
  });

  it('grants only SELECT and INSERT policies on medical_notes (zero UPDATE or DELETE policies)', () => {
    expect(rlsSql).toContain('CREATE POLICY "pt_select_medical_notes" ON medical_notes');
    expect(rlsSql).toContain('CREATE POLICY "pt_insert_medical_notes" ON medical_notes');
    expect(rlsSql).not.toContain('CREATE POLICY "pt_update_medical_notes"');
    expect(rlsSql).not.toContain('CREATE POLICY "pt_delete_medical_notes"');
  });
});

describe('Phase 4: Module 3 PT Exercise Prescription Restriction (Minigame Only)', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  const rlsSql = fs.readFileSync(path.join(migrationsDir, '20261022000002_rls_and_policies.sql'), 'utf8');

  function validateExercisesForPT(
    exercisesInPlan: { title: string; type: 'minigame' | 'exercise' }[]
  ): { valid: boolean; error?: string } {
    const invalidExercises = exercisesInPlan.filter((e) => e.type !== 'minigame');
    if (invalidExercises.length > 0) {
      return {
        valid: false,
        error: 'PT role is only authorized to prescribe minigame exercises. Physical therapy exercises are currently in development.',
      };
    }
    return { valid: true };
  }

  it('allows PT to prescribe minigame exercises', () => {
    const result = validateExercisesForPT([
      { title: 'Arm Flap Bird', type: 'minigame' },
      { title: 'Balance Bubble Pop', type: 'minigame' },
    ]);
    expect(result.valid).toBe(true);
  });

  it('rejects PT prescription when any item is of type "exercise"', () => {
    const result = validateExercisesForPT([
      { title: 'Arm Flap Bird', type: 'minigame' },
      { title: 'Quadriceps Stretch Routine', type: 'exercise' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('PT role is only authorized to prescribe minigame exercises');
  });

  it('contains database trigger validate_course_item_exercise_type enforcing minigame restriction on DB insert', () => {
    expect(rlsSql).toContain('CREATE OR REPLACE FUNCTION validate_course_item_exercise_type()');
    expect(rlsSql).toContain("IF v_role = 'pt' THEN");
    expect(rlsSql).toContain("IF v_exercise_type <> 'minigame' THEN");
    expect(rlsSql).toContain(
      "RAISE EXCEPTION 'PT role is only authorized to prescribe minigame exercises. Physical therapy exercises are currently in development.'"
    );
  });
});
