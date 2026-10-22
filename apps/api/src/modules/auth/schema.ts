import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string({ message: 'Username is required' })
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must not exceed 50 characters'),
  password: z
    .string({ message: 'Password is required' })
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
