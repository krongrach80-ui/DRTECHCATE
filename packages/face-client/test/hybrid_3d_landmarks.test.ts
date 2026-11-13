import { describe, it, expect } from 'vitest';
import { GeometricLandmarkEmbeddingModel, cosineSimilarity } from '../src/embed';
import type { FaceLandmarks, Point2D } from '../src/detect';

interface SkullTraits {
  eyeWidth: number;
  interCanthal: number;
  noseLength: number;
  noseBridgeDepth: number;
  noseTipProj: number;
  alarWidth: number;
  cheekWidth: number;
  cheekProminence: number;
  jawWidth: number;
  chinLength: number;
  browHeight: number;
  mouthWidth: number;
}

function makeTransformedMesh(
  traits: SkullTraits,
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number,
  scale = 1.0,
  brightness = 155,
  lightTilt = 0
): { canvas: HTMLCanvasElement; landmarks: FaceLandmarks } {
  // Base points in 3D skull space (centered near nose bridge 168)
  const raw3D: Array<{ x: number; y: number; z: number }> = new Array(478)
    .fill(null)
    .map((_, idx) => ({
      x: Math.sin(idx * 0.7) * 0.35,
      y: Math.cos(idx * 0.5) * 0.45,
      z: -Math.abs(Math.sin(idx * 0.3)) * 0.25,
    }));

  const setPt = (idx: number, x: number, y: number, z: number) => {
    raw3D[idx] = { x, y, z };
  };

  // Rigid anchor landmarks + craniofacial traits
  setPt(168, 0, -0.15, traits.noseBridgeDepth); // glabella/nasion anchor
  setPt(10, 0, -0.92, -0.12);
  setPt(151, 0, -0.58, 0.02);
  setPt(6, 0, -0.02, traits.noseBridgeDepth + 0.05);
  setPt(197, 0, 0.14, traits.noseBridgeDepth + 0.11);
  setPt(5, 0, 0.28, traits.noseTipProj * 0.62);
  setPt(4, 0, 0.40, traits.noseTipProj * 0.94);
  setPt(1, 0, 0.44, traits.noseTipProj); // nose tip
  setPt(2, 0, -0.15 + traits.noseLength, 0.14); // subnasale

  // Eyes (left 33..133, right 362..263)
  const ic = traits.interCanthal * 0.5;
  const ew = traits.eyeWidth;
  setPt(33, -(ic + ew), -0.18, -0.12);
  setPt(133, -ic, -0.17, 0.02);
  setPt(159, -(ic + ew * 0.5), -0.23, 0.0);
  setPt(145, -(ic + ew * 0.5), -0.13, 0.0);
  setPt(362, ic, -0.17, 0.02);
  setPt(263, ic + ew, -0.18, -0.12);
  setPt(386, ic + ew * 0.5, -0.23, 0.0);
  setPt(374, ic + ew * 0.5, -0.13, 0.0);

  // Brows
  setPt(70, -(ic + ew * 0.95), -0.18 - traits.browHeight * 0.8, -0.05);
  setPt(105, -(ic + ew * 0.45), -0.18 - traits.browHeight, 0.11);
  setPt(107, -ic * 0.85, -0.17 - traits.browHeight * 1.02, 0.10);
  setPt(300, ic + ew * 0.95, -0.18 - traits.browHeight * 0.8, -0.05);
  setPt(334, ic + ew * 0.45, -0.18 - traits.browHeight, 0.11);
  setPt(336, ic * 0.85, -0.17 - traits.browHeight * 1.02, 0.10);

  // Nose bridge width & alar
  setPt(193, -0.12, -0.06, 0.08);
  setPt(417, 0.12, -0.06, 0.08);
  setPt(122, -0.14, 0.12, 0.12);
  setPt(351, 0.14, 0.12, 0.12);
  setPt(48, -traits.alarWidth * 0.42, 0.40, 0.06);
  setPt(278, traits.alarWidth * 0.42, 0.40, 0.06);
  setPt(98, -traits.alarWidth * 0.5, 0.48, 0.04);
  setPt(327, traits.alarWidth * 0.5, 0.48, 0.04);

  // Midface & cheekbones
  setPt(118, -(ic + ew * 0.4), -0.02, 0.08);
  setPt(347, ic + ew * 0.4, -0.02, 0.08);
  setPt(50, -traits.cheekWidth * 0.30, 0.16, traits.cheekProminence);
  setPt(280, traits.cheekWidth * 0.30, 0.16, traits.cheekProminence);
  setPt(123, -traits.cheekWidth * 0.44, 0.22, traits.cheekProminence - 0.18);
  setPt(352, traits.cheekWidth * 0.44, 0.22, traits.cheekProminence - 0.18);
  setPt(234, -traits.cheekWidth * 0.5, 0.04, -0.78);
  setPt(454, traits.cheekWidth * 0.5, 0.04, -0.78);
  setPt(67, -traits.cheekWidth * 0.30, -0.82, -0.25);
  setPt(297, traits.cheekWidth * 0.30, -0.82, -0.25);

  // Mouth & jawline
  const chinY = -0.15 + traits.noseLength + traits.chinLength;
  setPt(0, 0, -0.15 + traits.noseLength + 0.21, 0.12);
  setPt(37, -0.10, -0.15 + traits.noseLength + 0.20, 0.11);
  setPt(267, 0.10, -0.15 + traits.noseLength + 0.20, 0.11);
  setPt(61, -traits.mouthWidth * 0.5, -0.15 + traits.noseLength + 0.26, -0.02);
  setPt(291, traits.mouthWidth * 0.5, -0.15 + traits.noseLength + 0.26, -0.02);
  setPt(17, 0, chinY - 0.44, 0.04);
  setPt(152, 0, chinY, 0.04);
  setPt(172, -traits.jawWidth * 0.5, chinY - 0.26, -0.44);
  setPt(397, traits.jawWidth * 0.5, chinY - 0.26, -0.44);
  setPt(136, -traits.jawWidth * 0.40, chinY - 0.16, -0.28);
  setPt(365, traits.jawWidth * 0.40, chinY - 0.16, -0.28);
  setPt(150, -traits.jawWidth * 0.30, chinY - 0.08, -0.14);
  setPt(379, traits.jawWidth * 0.30, chinY - 0.08, -0.14);
  setPt(149, -traits.jawWidth * 0.23, chinY - 0.04, -0.06);
  setPt(378, traits.jawWidth * 0.23, chinY - 0.04, -0.06);
  setPt(148, -traits.jawWidth * 0.12, chinY - 0.01, -0.02);
  setPt(377, traits.jawWidth * 0.12, chinY - 0.01, -0.02);

  // Rotate 3D points (Euler yaw -> pitch -> roll) & project to 112x112 space
  const ry = (yawDeg * Math.PI) / 180;
  const rx = (pitchDeg * Math.PI) / 180;
  const rz = (rollDeg * Math.PI) / 180;
  const pxScale = 36 * scale;
  const cx = 56;
  const cy = 54;

  const rotated = raw3D.map((pt) => {
    const x1 = pt.x * Math.cos(ry) + pt.z * Math.sin(ry);
    const z1 = -pt.x * Math.sin(ry) + pt.z * Math.cos(ry);
    const y2 = pt.y * Math.cos(rx) - z1 * Math.sin(rx);
    const z2 = pt.y * Math.sin(rx) + z1 * Math.cos(rx);
    const x3 = x1 * Math.cos(rz) - y2 * Math.sin(rz);
    const y3 = x1 * Math.sin(rz) + y2 * Math.cos(rz);
    return {
      x: cx + x3 * pxScale,
      y: cy + y3 * pxScale,
      z: z2 * pxScale,
    };
  });

  const midEye = (lIdx: number, rIdx: number): Point2D => ({
    x: (rotated[lIdx].x + rotated[rIdx].x) * 0.5,
    y: (rotated[lIdx].y + rotated[rIdx].y) * 0.5,
  });

  const landmarks: FaceLandmarks = {
    leftEye: midEye(33, 133),
    rightEye: midEye(362, 263),
    noseTip: { x: rotated[1].x, y: rotated[1].y },
    leftMouth: { x: rotated[61].x, y: rotated[61].y },
    rightMouth: { x: rotated[291].x, y: rotated[291].y },
    rawLandmarks3D: rotated,
  };

  // Render aligned 112x112 grayscale/RGB facial texture matching projected landmarks + lighting variation
  const w = 112;
  const h = 112;
  const data = new Uint8ClampedArray(w * h * 4);
  const eyeLx = 56 - (traits.interCanthal * 0.5 + traits.eyeWidth * 0.5) * 24;
  const eyeRx = 56 + (traits.interCanthal * 0.5 + traits.eyeWidth * 0.5) * 24;
  const eyeY = 46 - (traits.browHeight - 0.16) * 20;
  const browY = 36 - (traits.browHeight - 0.16) * 35;
  const mouthY = 56 + (traits.noseLength + 0.18) * 30;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const sideRamp = ((x - 56) / 56) * lightTilt;
      const eyeL = Math.exp(-((x - eyeLx) ** 2 + (y - eyeY) ** 2) / (34 + traits.eyeWidth * 28));
      const eyeR = Math.exp(-((x - eyeRx) ** 2 + (y - eyeY) ** 2) / (34 + traits.eyeWidth * 28));
      const brow =
        (Math.exp(-((x - eyeLx) ** 2) / 140) + Math.exp(-((x - eyeRx) ** 2) / 140)) *
        Math.exp(-((y - browY) ** 2) / 12);
      const noseH = Math.exp(-((x - 56) ** 2 + (y - 60) ** 2) / (24 + traits.alarWidth * 45));
      const mouthH = Math.exp(-((x - 56) ** 2 + (y - mouthY) ** 2) / (36 + traits.mouthWidth * 55));
      const jawShade = Math.exp(-((x - 56) ** 2) / ((traits.jawWidth * 24) ** 2)) * (y > 70 ? 12 : 0);
      const baseLum =
        brightness +
        sideRamp -
        60 * (eyeL + eyeR) -
        35 * brow +
        24 * noseH -
        50 * mouthH -
        jawShade +
        Math.sin(x * (0.12 + traits.noseLength * 0.08) + y * (0.07 + traits.jawWidth * 0.04)) * 12;
      const clamped = Math.max(0, Math.min(255, baseLum));
      data[idx] = clamped;
      data[idx + 1] = clamped * 0.88;
      data[idx + 2] = clamped * 0.78;
      data[idx + 3] = 255;
    }
  }

  const canvas = {
    width: w,
    height: h,
    getContext: () => ({
      getImageData: () => ({ data, width: w, height: h }),
    }),
  } as unknown as HTMLCanvasElement;

  return { canvas, landmarks };
}

describe('[FACE-CLIENT] Hybrid 3D Craniofacial + 2D Texture Embeddings', () => {
  const model = new GeometricLandmarkEmbeddingModel();

  const patientA: SkullTraits = {
    eyeWidth: 0.36,
    interCanthal: 0.54,
    noseLength: 0.66,
    noseBridgeDepth: 0.12,
    noseTipProj: 0.42,
    alarWidth: 0.50,
    cheekWidth: 2.08,
    cheekProminence: 0.02,
    jawWidth: 1.62,
    chinLength: 0.86,
    browHeight: 0.16,
    mouthWidth: 0.64,
  };

  const strangerB: SkullTraits = {
    eyeWidth: 0.43,
    interCanthal: 0.71,
    noseLength: 0.84,
    noseBridgeDepth: 0.25,
    noseTipProj: 0.58,
    alarWidth: 0.69,
    cheekWidth: 2.38,
    cheekProminence: 0.16,
    jawWidth: 1.96,
    chinLength: 1.08,
    browHeight: 0.26,
    mouthWidth: 0.82,
  };

  it('maintains high similarity (>= 0.85) for same person under +/-18 deg 3D pose, zoom & uneven side lighting', async () => {
    const enrolledFrontal = makeTransformedMesh(patientA, 0, 0, 0, 1.0, 160, 0);
    const probeTurnedLit = makeTransformedMesh(patientA, 17, -13, 9, 1.25, 118, 32);

    const embEnrolled = await model.embed(enrolledFrontal.canvas, enrolledFrontal.landmarks);
    const embProbe = await model.embed(probeTurnedLit.canvas, probeTurnedLit.landmarks);

    const sim = cosineSimilarity(embEnrolled, embProbe);
    expect(embEnrolled).toHaveLength(512);
    expect(embProbe).toHaveLength(512);
    expect(sim).toBeGreaterThanOrEqual(0.85);
  });

  it('cleanly separates distinct person (< 0.55 similarity, margin >= 0.30) even under matching lighting', async () => {
    const meshA = makeTransformedMesh(patientA, 2, -2, 1, 1.0, 155, 5);
    const meshA_probe = makeTransformedMesh(patientA, -12, 10, -7, 0.85, 130, -25);
    const meshB = makeTransformedMesh(strangerB, 2, -2, 1, 1.0, 155, 5);

    const embA = await model.embed(meshA.canvas, meshA.landmarks);
    const embA_probe = await model.embed(meshA_probe.canvas, meshA_probe.landmarks);
    const embB = await model.embed(meshB.canvas, meshB.landmarks);

    const genuineSim = cosineSimilarity(embA, embA_probe);
    const impostorSim = cosineSimilarity(embA, embB);

    expect(genuineSim).toBeGreaterThanOrEqual(0.85);
    expect(impostorSim).toBeLessThan(0.55);
    expect(genuineSim - impostorSim).toBeGreaterThanOrEqual(0.30);
  });
});
