/**
 * packages/kinematic-replay-3d/src/HolographicReplayViewer.tsx
 *
 * 3D KINEMATIC HOLOGRAPHIC REPLAY VIEWER (SaMD Class II & Zero-Video)
 *
 * Features:
 * 1. Pure HTML5 Canvas 3D Isometric/Perspective Projection Math:
 *    - Zero heavy 3D library bloat (Three.js/Babylon.js avoided)
 *    - Zero WebGL context conflicts
 * 2. 360° Free Orbit Rotation & Zoom:
 *    - Mouse/Touch Drag: Yaw (horizontal) and Pitch (vertical)
 *    - Wheel/Buttons: Zoom in / Zoom out
 * 3. 3D Reference Ground Grid & Anatomical Stress Shading:
 *    - Emerald (#10b981) for normal physiological motion
 *    - Amber (#f59e0b) for active kinetic compensation
 *    - Pulsing Neon Red (#ef4444) for pain/jerk anomaly frames
 * 4. Clinical Time-Scrubber & Dual Sparkline Graph (ROM Angle vs. Angular Velocity)
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  AlertOctagon,
  X,
  Compass,
  Activity,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import { KinematicReplaySnapshot } from './ringBuffer';
import { detectBiomechanicalAnomalies, AnomalyDetectionResult } from './biomechanicalAnomalyFinder';
import { useClinicalI18n, LanguageSwitcher } from '../../clinical-i18n/src/index';

interface HolographicReplayViewerProps {
  snapshot: KinematicReplaySnapshot;
  onClose: () => void;
  title?: string;
}

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], // Shoulders
  [11, 13], [13, 15], // Left arm
  [12, 14], [14, 16], // Right arm
  [11, 23], [12, 24], // Torso
  [23, 24], // Hips
  [23, 25], [25, 27], // Left leg
  [24, 26], [26, 28], // Right leg
];

export const HolographicReplayViewer: React.FC<HolographicReplayViewerProps> = ({
  snapshot,
  onClose,
  title,
}) => {
  const { t } = useClinicalI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Playback states
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.25 | 0.5 | 1.0>(1.0);

  // 3D Camera view angles & zoom
  const [yaw, setYaw] = useState(0.2); // Horizontal orbit angle (radians)
  const [pitch, setPitch] = useState(0.15); // Vertical orbit angle (radians)
  const [zoom, setZoom] = useState(1.1);

  // Mouse drag tracking for 360° orbit
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Anomaly & Micro-Jerk detection result
  const anomalyResult: AnomalyDetectionResult = useMemo(() => {
    return detectBiomechanicalAnomalies(snapshot);
  }, [snapshot]);

  const totalFrames = snapshot.frames.length;
  const currentFrame = snapshot.frames[currentFrameIdx] || snapshot.frames[0];

  // Jump to peak anomaly frame
  const handleJumpToAnomaly = useCallback(() => {
    if (anomalyResult.hasAnomaly) {
      setCurrentFrameIdx(anomalyResult.peakJerkFrameIndex);
      setIsPlaying(false);
    }
  }, [anomalyResult]);

  // Frame stepper loop
  useEffect(() => {
    if (!isPlaying || totalFrames <= 1) return;

    const intervalMs = Math.round((1000 / (snapshot.fps || 30)) / playbackSpeed);
    const timer = setInterval(() => {
      setCurrentFrameIdx((prev) => (prev + 1) % totalFrames);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, totalFrames, snapshot.fps, playbackSpeed]);

  // 3D Perspective Projection Function
  const project3D = useCallback(
    (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      curYaw: number,
      curPitch: number,
      curZoom: number
    ): { sx: number; sy: number; depth: number } => {
      // Normalize MediaPipe coords: x in [0, 1], y in [0, 1], z in [-0.5, 0.5]
      // Center at origin (0, 0, 0)
      const cx = (x - 0.5) * 500;
      const cy = (y - 0.5) * 500;
      const cz = z * 500;

      // 1. Yaw rotation around Y axis
      const cosY = Math.cos(curYaw);
      const sinY = Math.sin(curYaw);
      const x1 = cx * cosY + cz * sinY;
      const z1 = -cx * sinY + cz * cosY;

      // 2. Pitch rotation around X axis
      const cosP = Math.cos(curPitch);
      const sinP = Math.sin(curPitch);
      const y2 = cy * cosP - z1 * sinP;
      const z2 = cy * sinP + z1 * cosP;

      // 3. Perspective division
      const cameraDistance = 900;
      const fov = 650 * curZoom;
      const perspective = fov / (cameraDistance + z2);

      const sx = w / 2 + x1 * perspective;
      const sy = h / 2 + y2 * perspective;

      return { sx, sy, depth: z2 };
    },
    []
  );

  // Render 3D Scene onto HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Draw 3D Ground Reference Grid Floor
    ctx.strokeStyle = 'rgba(15, 118, 110, 0.22)';
    ctx.lineWidth = 1;
    const gridSize = 350;
    const gridStep = 70;
    const floorY = 0.85; // Ground level

    for (let gx = -gridSize; gx <= gridSize; gx += gridStep) {
      const pStart = project3D(0.5 + gx / 1000, floorY, -gridSize / 1000, w, h, yaw, pitch, zoom);
      const pEnd = project3D(0.5 + gx / 1000, floorY, gridSize / 1000, w, h, yaw, pitch, zoom);
      ctx.beginPath();
      ctx.moveTo(pStart.sx, pStart.sy);
      ctx.lineTo(pEnd.sx, pEnd.sy);
      ctx.stroke();
    }

    for (let gz = -gridSize; gz <= gridSize; gz += gridStep) {
      const pStart = project3D(0.5 - gridSize / 1000, floorY, gz / 1000, w, h, yaw, pitch, zoom);
      const pEnd = project3D(0.5 + gridSize / 1000, floorY, gz / 1000, w, h, yaw, pitch, zoom);
      ctx.beginPath();
      ctx.moveTo(pStart.sx, pStart.sy);
      ctx.lineTo(pEnd.sx, pEnd.sy);
      ctx.stroke();
    }

    // 2. Project all landmarks of current frame
    const projected = currentFrame.landmarks.map((lm) =>
      project3D(lm.x, lm.y, lm.z ?? 0, w, h, yaw, pitch, zoom)
    );

    // 3. Determine frame strain color
    const isAnomalyFrame =
      anomalyResult.anomalyFrameIndices.includes(currentFrameIdx) || currentFrame.isPainEvent;
    const isCompensation = (currentFrame.trunkLateralTiltDeg ?? 0) > 10;

    const boneColor = isAnomalyFrame
      ? '#ef4444' // Neon Red
      : isCompensation
      ? '#f59e0b' // Amber
      : '#10b981'; // Emerald

    // 4. Draw Skeletal Connections (3D Bones)
    ctx.strokeStyle = boneColor;
    ctx.lineWidth = isAnomalyFrame ? 4.5 : 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [iA, iB] of POSE_CONNECTIONS) {
      if (projected[iA] && projected[iB]) {
        const visA = currentFrame.landmarks[iA]?.visibility ?? 1.0;
        const visB = currentFrame.landmarks[iB]?.visibility ?? 1.0;
        if (visA >= 0.4 && visB >= 0.4) {
          ctx.beginPath();
          ctx.moveTo(projected[iA].sx, projected[iA].sy);
          ctx.lineTo(projected[iB].sx, projected[iB].sy);
          ctx.stroke();
        }
      }
    }

    // 5. Draw Joint Nodes
    for (let i = 0; i < projected.length; i++) {
      const p = projected[i];
      const lm = currentFrame.landmarks[i];
      if ((lm?.visibility ?? 1.0) >= 0.4) {
        ctx.beginPath();
        const isKeyJoint = [11, 12, 13, 14, 15, 16, 23, 24].includes(i);
        const radius = isKeyJoint ? 6.5 : 4.5;
        ctx.arc(p.sx, p.sy, radius, 0, 2 * Math.PI);

        if (isAnomalyFrame && [11, 12, 13, 14, 15, 16].includes(i)) {
          // Flashing glowing aura around culprit limbs
          ctx.fillStyle = '#ef4444';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = boneColor;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
  }, [currentFrame, currentFrameIdx, yaw, pitch, zoom, project3D, anomalyResult]);

  // Mouse drag handlers for 360° orbit
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setYaw((prev) => prev + dx * 0.008);
    setPitch((prev) => Math.max(-1.2, Math.min(1.2, prev + dy * 0.008)));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.6, Math.min(2.5, prev - e.deltaY * 0.001)));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl text-white flex flex-col font-sans select-none overflow-hidden animate-fade-in">
      {/* 1. Header Bar */}
      <div className="w-full bg-slate-900/90 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
            <Compass className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>{title || t('3d_kinematic_replay')}</span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-teal-950 border border-teal-500/40 text-teal-300 font-mono">
                {t('pipl_short_badge')}
              </span>
            </h2>
            <div className="text-xs text-slate-400 mt-0.5">
              {snapshot.exerciseName} • {snapshot.totalFrames} Frames ({snapshot.fps} FPS)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher variant="dark" />

          {anomalyResult.hasAnomaly && (
            <button
              type="button"
              onClick={handleJumpToAnomaly}
              className="px-3.5 py-2 rounded-xl bg-rose-950/90 hover:bg-rose-900 border border-rose-500/60 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-lg shadow-rose-950/50"
            >
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{t('jump_to_anomaly')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer border border-slate-700"
            title={t('close_window')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. Main 3D Canvas Area */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900/60 to-slate-950">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
        />

        {/* 3D Orbit Controls Floating Hint */}
        <div className="absolute top-4 left-6 pointer-events-none text-[11px] text-slate-400 bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-xl backdrop-blur-md">
          {t('rotate_360_hint')}
        </div>

        {/* Zoom Controls Floating Bar */}
        <div className="absolute top-4 right-6 flex flex-col gap-2 z-10">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white shadow-lg cursor-pointer"
            title="ซูมเข้า"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white shadow-lg cursor-pointer"
            title="ซูมออก"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setYaw(0.2);
              setPitch(0.15);
              setZoom(1.1);
            }}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white shadow-lg cursor-pointer"
            title="รีเซ็ตมุมมอง"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Clinical Diagnostics Overlay Card */}
        <div className="absolute bottom-6 left-6 z-10 p-4 rounded-2xl bg-slate-900/85 border border-slate-800 backdrop-blur-md max-w-sm shadow-2xl">
          <div className="flex items-center gap-2 text-teal-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Activity className="w-4 h-4" />
            <span>Telemetry Telemetry</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400">องศาข้อต่อ:</span>
              <div className="text-base font-bold text-white mt-0.5">
                {currentFrame?.currentAngleDeg ?? 0}°
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400">ความเร็วเชิงมุม:</span>
              <div className="text-base font-bold text-teal-300 mt-0.5">
                {currentFrame?.angularVelocityDegPerSec ?? 0}°/s
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 col-span-2">
              <span className="text-slate-400">การเอียงชดเชย (Trunk Tilt):</span>
              <div className="text-sm font-bold text-amber-300 mt-0.5">
                {currentFrame?.trunkLateralTiltDeg ?? 0}°
              </div>
            </div>
          </div>

          {anomalyResult.hasAnomaly && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/40 text-[11px] text-rose-200">
              <div className="font-bold flex items-center gap-1.5 text-rose-400">
                <Flame className="w-3.5 h-3.5" />
                <span>{t('angular_jerk_anomaly')}:</span>
              </div>
              <p className="mt-1 leading-snug">{anomalyResult.descriptionTh}</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Playback Controls & Dual-Sparkline Scrubber */}
      <div className="w-full bg-slate-900/95 border-t border-slate-800 px-6 py-4 flex flex-col gap-3 z-20">
        {/* Scrubber Bar with Anomaly Markers */}
        <div className="relative w-full flex items-center">
          <input
            type="range"
            min={0}
            max={totalFrames - 1}
            value={currentFrameIdx}
            onChange={(e) => {
              setCurrentFrameIdx(Number(e.target.value));
              setIsPlaying(false);
            }}
            className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
          />

          {/* Anomaly Marker Pins on Timeline */}
          {anomalyResult.anomalyFrameIndices.map((idx) => {
            const leftPercent = (idx / Math.max(1, totalFrames - 1)) * 100;
            return (
              <div
                key={idx}
                style={{ left: `${leftPercent}%` }}
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white pointer-events-none shadow-lg animate-ping opacity-75"
              />
            );
          })}
        </div>

        {/* Buttons & Time Details */}
        <div className="flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold transition active:scale-95 cursor-pointer shadow-lg shadow-teal-950/50 flex items-center gap-1.5"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
              <span>{isPlaying ? 'พัก (Pause)' : 'เล่น (Play)'}</span>
            </button>

            {/* Playback Speed Toggles */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
              {([0.25, 0.5, 1.0] as const).map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                    playbackSpeed === speed
                      ? 'bg-teal-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-[11px] text-emerald-300 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{t('pipl_compliance')}</span>
          </div>

          <div className="font-mono text-slate-400">
            เฟรมที่ <span className="text-white font-bold">{currentFrameIdx + 1}</span> / {totalFrames}
          </div>
        </div>
      </div>
    </div>
  );
};
