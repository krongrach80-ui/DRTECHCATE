/**
 * packages/face-client/src/ring.ts
 * 10-Tick Biometric Enrollment Progress Ring UI Helper & Component (Spec 10 ระบบ 7 ข้อ 3)
 * Displays 10 progress ticks around face capture viewport:
 * - 4 ticks for front
 * - 2 ticks for left
 * - 2 ticks for right
 * - 2 ticks for nod
 * Supports prefers-reduced-motion for accessibility.
 */

import React from 'react';
import { REQUIRED_ENROLL_POSES } from './flow';
import { RequiredPose } from './quality';
import { getThaiPoseInstruction } from './liveness';

export interface ProgressRingTick {
  index: number;
  pose: RequiredPose;
  angleDeg: number;
  status: 'completed' | 'active' | 'pending';
}

export function computeProgressRingTicks(currentFrameIndex: number): ProgressRingTick[] {
  const total = REQUIRED_ENROLL_POSES.length; // 10
  const angleStep = 360 / total; // 36 deg per tick

  return REQUIRED_ENROLL_POSES.map((pose, idx) => {
    let status: 'completed' | 'active' | 'pending';
    if (idx < currentFrameIndex) {
      status = 'completed';
    } else if (idx === currentFrameIndex) {
      status = 'active';
    } else {
      status = 'pending';
    }

    // Start at top (-90 deg)
    const angleDeg = -90 + idx * angleStep;

    return {
      index: idx,
      pose,
      angleDeg,
      status,
    };
  });
}

/**
 * Checks if client user prefers reduced motion
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Canvas renderer for 10-tick progress ring overlay
 */
export function drawProgressRingOnCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  currentFrameIndex: number,
  pulseAlpha: number = 1.0
): void {
  const ticks = computeProgressRingTicks(currentFrameIndex);
  const reducedMotion = isReducedMotionPreferred();

  ctx.save();

  ticks.forEach((tick) => {
    const rad = (tick.angleDeg * Math.PI) / 180;
    const innerR = radius - 12;
    const outerR = radius + 6;

    const x1 = cx + innerR * Math.cos(rad);
    const y1 = cy + innerR * Math.sin(rad);
    const x2 = cx + outerR * Math.cos(rad);
    const y2 = cy + outerR * Math.sin(rad);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    if (tick.status === 'completed') {
      ctx.strokeStyle = '#10B981'; // Emerald 500
      ctx.shadowColor = '#10B981';
      ctx.shadowBlur = 8;
    } else if (tick.status === 'active') {
      ctx.strokeStyle = '#06B6D4'; // Cyan 500
      ctx.shadowColor = '#06B6D4';
      ctx.shadowBlur = reducedMotion ? 10 : 10 * pulseAlpha;
    } else {
      ctx.strokeStyle = '#334155'; // Slate 700
      ctx.shadowBlur = 0;
    }

    ctx.stroke();
  });

  ctx.restore();
}

export interface EnrollmentRingProps {
  currentFrameIndex: number; // 0 to 10
  currentPose?: RequiredPose;
  statusMessage?: string;
  size?: number; // diameter in px (default 320)
  className?: string;
}

/**
 * React SVG Component for 10-tick enrollment ring
 */
export const EnrollmentProgressRing: React.FC<EnrollmentRingProps> = ({
  currentFrameIndex,
  currentPose = REQUIRED_ENROLL_POSES[Math.min(currentFrameIndex, 9)],
  statusMessage,
  size = 320,
  className = '',
}) => {
  const ticks = computeProgressRingTicks(currentFrameIndex);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.44;
  const thaiText = statusMessage || getThaiPoseInstruction(currentPose);

  return React.createElement(
    'div',
    {
      className: `relative flex flex-col items-center justify-center select-none ${className}`,
      style: { width: size, height: size },
    },
    React.createElement(
      'svg',
      {
        width: size,
        height: size,
        className: 'absolute inset-0 pointer-events-none overflow-visible',
      },
      ticks.map((tick) => {
        const rad = (tick.angleDeg * Math.PI) / 180;
        const innerR = radius - 8;
        const outerR = radius + 6;

        const x1 = cx + innerR * Math.cos(rad);
        const y1 = cy + innerR * Math.sin(rad);
        const x2 = cx + outerR * Math.cos(rad);
        const y2 = cy + outerR * Math.sin(rad);

        let strokeColor = '#334155'; // Slate 700
        let tickClass = 'transition-all duration-300';

        if (tick.status === 'completed') {
          strokeColor = '#10B981'; // Emerald 500
        } else if (tick.status === 'active') {
          strokeColor = '#06B6D4'; // Cyan 500
          tickClass += ' animate-pulse motion-reduce:animate-none';
        }

        return React.createElement('line', {
          key: `tick-${tick.index}`,
          x1,
          y1,
          x2,
          y2,
          stroke: strokeColor,
          strokeWidth: tick.status === 'active' ? 5 : 4,
          strokeLinecap: 'round',
          className: tickClass,
        });
      })
    ),
    // Thai Instruction Banner
    React.createElement(
      'div',
      {
        className:
          'absolute -bottom-10 inset-x-0 mx-auto px-4 py-2 bg-slate-900/90 text-white rounded-full text-center text-sm font-medium shadow-lg border border-slate-700/60 max-w-[90%]',
      },
      thaiText
    )
  );
};

export interface LivenessTelemetryBadgeProps {
  state?: 'checking' | 'live_verified' | 'spoof_blocked';
  statusMessageThai?: string;
  depthScore?: number;
  ear?: number;
  isBlinking?: boolean;
  className?: string;
}

export const LivenessTelemetryBadge: React.FC<LivenessTelemetryBadgeProps> = ({
  state = 'checking',
  statusMessageThai,
  depthScore,
  ear,
  isBlinking,
  className = '',
}) => {
  let badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  let dotColor = 'bg-amber-400 animate-pulse';
  let defaultLabel = '🟡 กำลังตรวจสอบความมีชีวิต (Checking Liveness...)';

  if (state === 'live_verified') {
    badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.35)]';
    dotColor = 'bg-emerald-400';
    defaultLabel = '🟢 Liveness: บุคคลจริง (Live Verified)';
  } else if (state === 'spoof_blocked') {
    badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.45)]';
    dotColor = 'bg-rose-500 animate-ping';
    defaultLabel = '🔴 แจ้งเตือน: ไม่ผ่านเกณฑ์บุคคลจริง (Spoof Blocked)';
  }

  const label = statusMessageThai || defaultLabel;

  return React.createElement(
    'div',
    {
      className: `flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md text-xs font-semibold select-none transition-all duration-200 ${badgeColor} ${className}`,
    },
    React.createElement('span', { className: `w-2 h-2 rounded-full ${dotColor}` }),
    React.createElement('span', null, label),
    depthScore !== undefined
      ? React.createElement(
          'span',
          { className: 'text-[10px] opacity-75 font-mono ml-1' },
          `3D:${(depthScore * 100).toFixed(0)}%`
        )
      : null,
    ear !== undefined
      ? React.createElement(
          'span',
          { className: 'text-[10px] opacity-75 font-mono' },
          `EAR:${ear.toFixed(2)}${isBlinking ? ' (กะพริบตา)' : ''}`
        )
      : null
  );
};
