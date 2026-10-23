import { z } from 'zod';

// =========================================================================
// 1. EXERCISE SCHEMAS
// =========================================================================
export const ExerciseDifficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type ExerciseDifficulty = z.infer<typeof ExerciseDifficultySchema>;

export const CreateExerciseSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150),
  description: z.string().trim().max(1000).optional().nullable(),
  image_path: z.string().trim().max(500).optional().nullable(),
  target_joint: z.string().trim().max(100).optional().nullable(),
  suitable_for: z.string().trim().max(255).optional().nullable(),
  warnings: z.string().trim().max(500).optional().nullable(),
  default_sets: z.coerce.number().int().min(1).max(20).default(3),
  default_reps: z.coerce.number().int().min(1).max(100).default(10),
  difficulty: ExerciseDifficultySchema.default('beginner'),
});

export type CreateExerciseInput = z.infer<typeof CreateExerciseSchema>;

export const UpdateExerciseSchema = CreateExerciseSchema.partial();
export type UpdateExerciseInput = z.infer<typeof UpdateExerciseSchema>;

export const ExerciseQuerySchema = z.object({
  target_joint: z.string().trim().optional(),
  difficulty: ExerciseDifficultySchema.optional(),
  search: z.string().trim().optional(),
});

export type ExerciseQueryFilter = z.infer<typeof ExerciseQuerySchema>;

export interface ExerciseRecord {
  id: string;
  title: string;
  image_path: string | null;
  description: string | null;
  target_joint: string | null;
  suitable_for: string | null;
  warnings: string | null;
  default_sets: number;
  default_reps: number;
  difficulty: ExerciseDifficulty;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =========================================================================
// 2. MINIGAME SCHEMAS
// =========================================================================
export const CreateMinigameSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150),
  description: z.string().trim().max(500).optional().nullable(),
  category: z.string().trim().max(50).optional().nullable(),
});

export type CreateMinigameInput = z.infer<typeof CreateMinigameSchema>;

export const CreateMinigameQuestionSchema = z.object({
  prompt: z.string().trim().min(1, 'Question prompt is required').max(500),
  choices: z.array(z.string().trim().min(1)).min(2, 'Must have at least 2 choices').max(6),
  answer: z.string().trim().min(1, 'Answer is required'),
});

export type CreateMinigameQuestionInput = z.infer<typeof CreateMinigameQuestionSchema>;

export interface MinigameRecord {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MinigameQuestionRecord {
  id: string;
  minigame_id: string;
  prompt: string;
  choices: string[];
  answer: string;
  created_by: string;
  created_at: string;
}

// =========================================================================
// 3. MODPACK SCHEMAS
// =========================================================================
export const ModpackItemInputSchema = z.object({
  exercise_id: z.string().trim().min(1, 'Exercise ID is required'),
  sets: z.coerce.number().int().min(1).max(20),
  reps: z.coerce.number().int().min(1).max(100),
  position: z.coerce.number().int().min(1).max(50),
});

export type ModpackItemInput = z.infer<typeof ModpackItemInputSchema>;

export const CreateModpackSchema = z.object({
  name: z.string().trim().min(1, 'Modpack name is required').max(150),
  description: z.string().trim().max(500).optional().nullable(),
  items: z.array(ModpackItemInputSchema).min(1, 'Modpack must contain at least one exercise'),
});

export type CreateModpackInput = z.infer<typeof CreateModpackSchema>;

export const UpdateModpackSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  items: z.array(ModpackItemInputSchema).optional(),
});

export type UpdateModpackInput = z.infer<typeof UpdateModpackSchema>;

export interface ModpackItemRecord {
  id: string;
  modpack_id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  position: number;
  exercise?: ExerciseRecord | null;
}

export interface ModpackRecord {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  items: ModpackItemRecord[];
}

// =========================================================================
// 4. CASE TRANSFER SCHEMAS
// =========================================================================
export const CaseTransferStatusSchema = z.enum(['pending', 'active', 'completed', 'cancelled']);
export type CaseTransferStatus = z.infer<typeof CaseTransferStatusSchema>;

export const CreateCaseTransferSchema = z
  .object({
    patient_id: z.string().trim().min(1, 'Valid patient ID is required'),
    to_pt_id: z.string().trim().min(1, 'Valid destination PT ID is required'),
    from_pt_id: z.string().trim().optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be YYYY-MM-DD'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be YYYY-MM-DD'),
  })
  .refine(
    (data) => new Date(data.end_date).getTime() >= new Date(data.start_date).getTime(),
    {
      message: 'end_date must be greater than or equal to start_date',
      path: ['end_date'],
    }
  );

export type CreateCaseTransferInput = z.infer<typeof CreateCaseTransferSchema>;

export interface CaseTransferRecord {
  id: string;
  patient_id: string;
  from_pt_id: string;
  to_pt_id: string;
  start_date: string;
  end_date: string;
  created_by: string;
  status: CaseTransferStatus;
  created_at: string;
}
