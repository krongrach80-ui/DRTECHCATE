import { describe, it, expect } from 'vitest';
import {
  GeometricLandmarkEmbeddingModel,
  l2Normalize,
  cosineSimilarity,
  aggregateCapturedFrames,
  aggregateProbeEmbeddings,
  type CapturedEmbeddingSample,
} from '../src/embed';

function makeSyntheticFaceImageData(options: {
  eyeOffsetX?: number;
  eyeY?: number;
  noseWidth?: number;
  mouthY?: number;
  sideLightRamp?: number;
  baseSkin?: number;
  browThickness?: number;
}): { width: number; height: number; data: Uint8ClampedArray } {
  const width = 112;
  const height = 112;
  const data = new Uint8ClampedArray(width * height * 4);
  const eyeX = options.eyeOffsetX ?? 18;
  const eyeY = options.eyeY ?? 42;
  const noseW = options.noseWidth ?? 5;
  const mouthY = options.mouthY ?? 76;
  const ramp = options.sideLightRamp ?? 0;
  const baseSkin = options.baseSkin ?? 175;
  const browThick = options.browThickness ?? 3;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = (x - 56) / 44;
      const ny = (y - 52) / 42;
      const inOval = nx * nx + ny * ny <= 1.0 && y >= 16 && y <= 94;

      let lum = inOval ? baseSkin + ramp * nx : 40;
      // Eyes
      const dLeftEye = Math.hypot(x - (56 - eyeX), y - eyeY);
      const dRightEye = Math.hypot(x - (56 + eyeX), y - eyeY);
      if (dLeftEye < 6 || dRightEye < 6) lum -= 75;
      // Eyebrows
      if (y >= eyeY - 11 && y <= eyeY - 11 + browThick && (Math.abs(x - (56 - eyeX)) < 10 || Math.abs(x - (56 + eyeX)) < 10)) lum -= 55;
      // Nose bridge
      if (Math.abs(x - 56) < noseW && y >= eyeY + 2 && y <= 65) lum += 24;
      // Cheekbone / jaw shading difference
      if (inOval && Math.abs(x - 56) > 26 && y > 58) lum -= 18;
      // Mouth
      if (Math.abs(x - 56) < 13 && Math.abs(y - mouthY) < 3) lum -= 55;

      const c = Math.max(0, Math.min(255, Math.round(lum)));
      data[idx] = c;
      data[idx + 1] = Math.max(0, c - 12);
      data[idx + 2] = Math.max(0, c - 24);
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

function makeUnitAnchor(seed: number): number[] {
  const vec = Array.from({ length: 512 }, (_, i) => Math.sin(seed * 13.7 + i * 0.37) + Math.cos(i * 0.11 - seed));
  return l2Normalize(vec);
}

function perturbVector(base: number[], noiseScale: number, seed: number): number[] {
  const vec = base.map((v, i) => v + noiseScale * Math.sin(seed * 7.3 + i * 1.9));
  return l2Normalize(vec);
}

describe('Apple Face ID 120-Frame Pipeline & Photometric Robustness', () => {
  it('1. Side-window illumination detrending preserves same-person similarity across steep lighting ramps', async () => {
    const model = new GeometricLandmarkEmbeddingModel();
    const personNeutral = makeSyntheticFaceImageData({ eyeOffsetX: 16, eyeY: 40, noseWidth: 4, mouthY: 73, browThickness: 3, sideLightRamp: 0 });
    const personSideLit = makeSyntheticFaceImageData({ eyeOffsetX: 16, eyeY: 40, noseWidth: 4, mouthY: 73, browThickness: 3, sideLightRamp: 55 });
    const differentPerson = makeSyntheticFaceImageData({ eyeOffsetX: 25, eyeY: 47, noseWidth: 10, mouthY: 85, browThickness: 7, baseSkin: 145 });

    const embNeutral = await model.embed(personNeutral as unknown as ImageData);
    const embSideLit = await model.embed(personSideLit as unknown as ImageData);
    const embDifferent = await model.embed(differentPerson as unknown as ImageData);

    const samePersonSim = cosineSimilarity(embNeutral, embSideLit);
    const diffPersonSim = cosineSimilarity(embNeutral, embDifferent);

    expect(samePersonSim).toBeGreaterThan(0.85);
    expect(samePersonSim - diffPersonSim).toBeGreaterThan(0.12);
  });

  it('2. Aggregates 120 multi-angle frames into 10 strict outlier-free DB prototypes (4/2/2/2)', () => {
    const trueFace = makeUnitAnchor(42);
    const impostorGlitch = makeUnitAnchor(999);
    const samples: CapturedEmbeddingSample[] = [];

    // 40 front, 24 left, 24 right, 16 up, 16 nod = 120 frames (+ 4 corrupted outliers)
    for (let i = 0; i < 40; i++) {
      samples.push({
        embedding: i === 5 || i === 19 ? perturbVector(impostorGlitch, 0.05, i) : perturbVector(trueFace, 0.04, i),
        poseZone: 'front',
        qualityScore: i === 5 ? 0.3 : 0.85,
        yaw: (i - 20) * 0.4,
      });
    }
    for (let i = 0; i < 24; i++) {
      samples.push({
        embedding: perturbVector(trueFace, 0.06, 100 + i),
        poseZone: 'left',
        qualityScore: 0.8,
        yaw: -8 - i * 0.6,
      });
    }
    for (let i = 0; i < 24; i++) {
      samples.push({
        embedding: perturbVector(trueFace, 0.06, 200 + i),
        poseZone: 'right',
        qualityScore: 0.8,
        yaw: 8 + i * 0.6,
      });
    }
    for (let i = 0; i < 16; i++) {
      samples.push({
        embedding: perturbVector(trueFace, 0.06, 300 + i),
        poseZone: 'up',
        qualityScore: 0.78,
        pitch: -7 - i * 0.5,
      });
    }
    for (let i = 0; i < 16; i++) {
      samples.push({
        embedding: perturbVector(trueFace, 0.06, 400 + i),
        poseZone: 'nod',
        qualityScore: 0.78,
        pitch: 7 + i * 0.5,
      });
    }

    const result = aggregateCapturedFrames(samples);
    expect(result.totalInputFrames).toBe(120);
    expect(result.rejectedOutliers).toBeGreaterThanOrEqual(2);
    expect(result.prototypes).toHaveLength(10);

    const poseCounts = result.prototypes.reduce<Record<string, number>>((acc, p) => {
      acc[p.pose] = (acc[p.pose] || 0) + 1;
      return acc;
    }, {});
    expect(poseCounts).toEqual({ front: 4, left: 2, right: 2, nod: 2 });

    // Every prototype & centroid is L2-normalized and strongly aligned with trueFace despite injected glitches
    expect(cosineSimilarity(result.frontalCentroid, trueFace)).toBeGreaterThan(0.985);
    expect(cosineSimilarity(result.overallCentroid, trueFace)).toBeGreaterThan(0.98);
    for (const proto of result.prototypes) {
      const norm = Math.sqrt(proto.embedding.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 4);
      expect(cosineSimilarity(proto.embedding, trueFace)).toBeGreaterThan(0.95);
    }
  });

  it('3. Neck-comfort fallback cleanly fills all 10 prototypes even with frontal-only samples', () => {
    const face = makeUnitAnchor(77);
    const samples: CapturedEmbeddingSample[] = Array.from({ length: 120 }, (_, i) => ({
      embedding: perturbVector(face, 0.03, i),
      poseZone: 'front',
      qualityScore: 0.88,
      yaw: ((i % 7) - 3) * 1.5,
    }));

    const result = aggregateCapturedFrames(samples);
    expect(result.prototypes).toHaveLength(10);
    expect(result.prototypes.map((p) => p.pose)).toEqual([
      'front', 'front', 'front', 'front',
      'left', 'left',
      'right', 'right',
      'nod', 'nod',
    ]);
    // Individual noisy frames (~0.90 cosine each) aggregate into an ultra-crisp >= 0.99 centroid
    expect(result.consistencyScore).toBeGreaterThan(0.88);
    expect(cosineSimilarity(result.frontalCentroid, face)).toBeGreaterThan(0.99);
    expect(cosineSimilarity(result.overallCentroid, face)).toBeGreaterThan(0.99);
  });

  it('4. aggregateProbeEmbeddings rejects motion-blur/glitched frame outlier before probe login comparison', () => {
    const userFace = makeUnitAnchor(11);
    const motionGlitch = makeUnitAnchor(888);

    const probeOut = aggregateProbeEmbeddings([
      { embedding: perturbVector(userFace, 0.03, 1), qualityScore: 0.92 },
      { embedding: perturbVector(userFace, 0.03, 2), qualityScore: 0.89 },
      { embedding: perturbVector(userFace, 0.04, 3), qualityScore: 0.86 },
      { embedding: motionGlitch, qualityScore: 0.45 },
      { embedding: perturbVector(userFace, 0.03, 4), qualityScore: 0.9 },
      { embedding: perturbVector(userFace, 0.03, 5), qualityScore: 0.88 },
    ]);

    expect(probeOut.rejectedOutliers).toBeGreaterThanOrEqual(1);
    expect(cosineSimilarity(probeOut.centroid, userFace)).toBeGreaterThan(0.99);
  });
});

