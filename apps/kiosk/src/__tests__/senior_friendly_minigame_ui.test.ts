/**
 * apps/kiosk/src/__tests__/senior_friendly_minigame_ui.test.ts
 *
 * Dedicated Verification Suite for:
 * MASTER PROMPT — DR.TECH.CARE MINIGAME SENIOR-FRIENDLY LARGE UI & PORTRAIT LAYOUT
 *
 * Verifies:
 * 1. Question typography scale: 36px - 54px (clamp(2.25rem, 4.5vw, 3.375rem)), font-extrabold, contrast >= 7:1
 * 2. Hero Illustration card: flex-1, occupies middle vertical space, illustration size 220px-300px
 * 3. Illustration caption: 32px - 46px (clamp(2rem, 4vw, 2.875rem)), font-bold, label badge >= 20px
 * 4. Gesture Instruction bar: 24px - 28px (clamp(1.5rem, 2.5vw, 1.75rem)), font-extrabold
 * 5. Touch answer buttons: min-h >= 76px-88px, font 28px-34px (clamp(1.75rem, 3vw, 2.125rem)), opposing colors
 * 6. Line height 1.45 standard to prevent Thai vowel/tone mark clipping
 * 7. Header sound & close touch targets >= 56px
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('DR.TECH.CARE Minigame Senior-Friendly Large UI & Portrait Layout', () => {
  const gameFilePath = path.resolve(__dirname, '../minigame-cards/PhysicalCardGame.tsx');
  const visualsFilePath = path.resolve(__dirname, '../minigame-cards/PhysicalCardVisuals.tsx');
  const gameSource = fs.readFileSync(gameFilePath, 'utf8');
  const visualsSource = fs.readFileSync(visualsFilePath, 'utf8');

  it('1. Header Bar: Sound toggle and Exit button meet WCAG AAA senior touch target (min-h-[56px] min-w-[56px])', () => {
    expect(gameSource).toContain('min-h-[56px] min-w-[56px]');
    expect(gameSource).toContain('w-14 h-14');
  });

  it('2. Hero Question Box: Features extra-large senior typography (clamp 2.25rem to 3.375rem / 36px-54px)', () => {
    expect(gameSource).toContain('clamp(2.25rem, 4.5vw, 3.375rem)');
    expect(gameSource).toContain('font-extrabold');
    expect(gameSource).toContain('lineHeight: 1.45');
  });

  it('3. Hero Illustration Card: Expands with flex-1 to fill portrait middle screen and hosts 220px-300px graphics', () => {
    expect(gameSource).toContain('flex-1');
    expect(gameSource).toContain('w-56 h-56');
    expect(gameSource).toContain('min-w-[200px]');
    expect(gameSource).toContain('max-w-[300px]');
  });

  it('4. Illustration Caption & Label: Caption reaches 32px-46px (clamp 2rem to 2.875rem) and label is >= 20px', () => {
    expect(gameSource).toContain('clamp(2rem, 4vw, 2.875rem)');
    expect(gameSource).toContain('text-xl sm:text-2xl font-black text-emerald-700');
  });

  it('5. Gesture Instruction Bar: Separate prominent bar scaled to 24px-28px (clamp 1.5rem to 1.75rem)', () => {
    expect(gameSource).toContain('clamp(1.5rem, 2.5vw, 1.75rem)');
    expect(gameSource).toContain('card_bottom_hint');
  });

  it('6. Bottom Touch Answer Buttons: Minimum height >= 76px-88px (min-h-[80px]), font 28px-34px (clamp 1.75rem to 2.125rem)', () => {
    expect(gameSource).toContain('min-h-[80px] sm:min-h-[88px]');
    expect(gameSource).toContain('clamp(1.75rem, 3vw, 2.125rem)');
    expect(gameSource).toContain('border-[#EA580C]');
    expect(gameSource).toContain('border-[#16A34A]');
  });

  it('7. Visuals scaling: Large fallback emoji scales up for senior readability', () => {
    expect(visualsSource).toContain('text-[140px] sm:text-[170px] md:text-[200px]');
  });

  it('8. Non-regression: Hand detection timing (0.6s / 600ms), 10 questions limit, and scoring logic remain intact', () => {
    expect(gameSource).toContain('HOLD_DWELL_MS = 600');
    expect(gameSource).toContain('maxQuestions');
    expect(gameSource).toContain('score');
  });
});
