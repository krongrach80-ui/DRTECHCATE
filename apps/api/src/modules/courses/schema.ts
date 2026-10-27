import { z } from 'zod';

// =========================================================================
// 1. ENUMS & HELPERS
// =========================================================================
export const CourseStatusSchema = z.enum(['active', 'completed', 'cancelled']);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

const WEEKDAY_NAME_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/**
 * Normalizes weekday values (numbers 0-6 or strings like 'mon', 'Monday') into sorted unique [0..6]
 */
export function normalizeWeekdays(raw: (number | string)[]): number[] {
  const set = new Set<number>();
  for (const item of raw) {
    if (typeof item === 'number' && item >= 0 && item <= 6) {
      set.add(item);
    } else if (typeof item === 'string') {
      const lower = item.trim().toLowerCase();
      if (WEEKDAY_NAME_MAP[lower] !== undefined) {
        set.add(WEEKDAY_NAME_MAP[lower]);
      } else {
        const parsed = parseInt(lower, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 6) {
          set.add(parsed);
        }
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

// =========================================================================
// 2. COURSE ITEM SCHEMAS
// =========================================================================
export const CourseItemInputSchema = z.object({
  exercise_id: z.string().trim().min(1, 'Exercise ID is required'),
  sets: z.coerce.number().int().min(1).max(20).default(3),
  reps: z.coerce.number().int().min(1).max(100).default(10),
  position: z.coerce.number().int().min(1).max(50).default(1),
});

export type CourseItemInput = z.infer<typeof CourseItemInputSchema>;

export interface CourseItemRecord {
  id: string;
  course_id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  position: number;
  created_at: string;
  exercise?: {
    id: string;
    title: string;
    target_joint?: string | null;
    difficulty?: string | null;
  } | null;
}

// =========================================================================
// 3. COURSE CRUD SCHEMAS
// =========================================================================
export const CreateCourseSchema = z
  .preprocess((val: any) => {
    if (typeof val === 'object' && val !== null) {
      const copy = { ...val };
      if (!copy.weekdays) {
        copy.weekdays = copy.days_of_week || copy.day_of_week || copy.selectedDays || copy.days;
      }
      return copy;
    }
    return val;
  }, z.object({
    patient_id: z.string().trim().min(1, 'Patient ID is required'),
    pt_id: z.string().trim().optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be YYYY-MM-DD'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be YYYY-MM-DD'),
    weekdays: z
      .array(z.union([z.number().int().min(0).max(6), z.string()]))
      .min(1, 'At least one weekday must be specified')
      .transform(normalizeWeekdays),
    start_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, 'start_time must be HH:MM or HH:MM:SS')
      .optional()
      .nullable(),
    kiosk_id: z.string().trim().optional().nullable(),
    include_minigame: z.boolean().default(false),
    modpack_id: z.string().trim().optional().nullable(),
    items: z.array(CourseItemInputSchema).optional().default([]),
    goals: z.string().trim().max(1000).optional().nullable(),
    progression_criteria: z.string().trim().max(1000).optional().nullable(),
  })
  .refine(
    (data) => new Date(data.end_date).getTime() >= new Date(data.start_date).getTime(),
    {
      message: 'end_date must be greater than or equal to start_date',
      path: ['end_date'],
    }
  ));

export type CreateCourseInput = z.input<typeof CreateCourseSchema>;
export type CreateCourseOutput = z.output<typeof CreateCourseSchema>;

export const UpdateCourseSchema = z
  .object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    weekdays: z
      .array(z.union([z.number().int().min(0).max(6), z.string()]))
      .transform(normalizeWeekdays)
      .optional(),
    start_time: z.string().optional().nullable(),
    kiosk_id: z.string().trim().optional().nullable(),
    include_minigame: z.boolean().optional(),
    modpack_id: z.string().trim().optional().nullable(),
    items: z.array(CourseItemInputSchema).optional(),
    status: CourseStatusSchema.optional(),
    goals: z.string().trim().max(1000).optional().nullable(),
    progression_criteria: z.string().trim().max(1000).optional().nullable(),
    version: z.coerce.number().int().min(1).optional(),
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return new Date(data.end_date).getTime() >= new Date(data.start_date).getTime();
      }
      return true;
    },
    {
      message: 'end_date must be greater than or equal to start_date',
      path: ['end_date'],
    }
  );

export type UpdateCourseInput = z.infer<typeof UpdateCourseSchema>;

export const CourseQuerySchema = z.object({
  patient_id: z.string().trim().optional(),
  pt_id: z.string().trim().optional(),
  status: CourseStatusSchema.optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kiosk_id: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CourseQueryFilter = z.infer<typeof CourseQuerySchema>;

export const TodayAppointmentsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kiosk_id: z.string().trim().optional().nullable(),
});

export type TodayAppointmentsFilter = z.infer<typeof TodayAppointmentsQuerySchema>;

export const CalendarViewQuerySchema = z.preprocess((val: any) => {
  if (typeof val === 'object' && val !== null) {
    const copy = { ...val };
    if (!copy.start_date) copy.start_date = copy.from || copy.from_date;
    if (!copy.end_date) copy.end_date = copy.to || copy.to_date;
    return copy;
  }
  return val;
}, z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM').optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pt_id: z.string().trim().optional(),
  patient_id: z.string().trim().optional(),
}));

export type CalendarViewFilter = z.infer<typeof CalendarViewQuerySchema>;

// =========================================================================
// 4. RECORD INTERFACES
// =========================================================================
export interface CourseRecord {
  id: string;
  patient_id: string;
  pt_id: string;
  start_date: string;
  end_date: string;
  weekdays: number[];
  start_time: string | null;
  kiosk_id: string | null;
  include_minigame: boolean;
  modpack_id: string | null;
  status: CourseStatus;
  version: number;
  goals: string | null;
  progression_criteria: string | null;
  created_at: string;
  updated_at: string;
  items?: CourseItemRecord[];
  patient?: {
    id: string;
    hn: string;
    first_name: string;
    last_name: string;
    phone?: string | null;
  } | null;
  pt?: {
    id: string;
    full_name: string;
    username: string;
  } | null;
}
