import { describe, it, expect } from 'vitest';
import { GeometricLandmarkEmbeddingModel } from '../src/embed';
import { evaluateBiometricMatch } from '../../../packages/smart-biometric-core/src/vectorMath';

describe('[FACE-CLIENT] Distinguish Different Faces vs Same Face', () => {
  const model = new GeometricLandmarkEmbeddingModel();

  function makeFaceCanvas(seed: number, brightness = 150): HTMLCanvasElement {
    const w = 112;
    const h = 112;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const eye1 = Math.exp(-((x - 38) ** 2 + (y - 51) ** 2) / (2 * ((seed % 5) + 4) ** 2));
        const eye2 = Math.exp(-((x - 73) ** 2 + (y - 51) ** 2) / (2 * ((seed % 5) + 4) ** 2));
        const nose = Math.exp(-((x - 56) ** 2 + (y - 71) ** 2) / (2 * ((seed % 6) + 5) ** 2));
        const mouth = Math.exp(-((x - 56) ** 2 + (y - 92) ** 2) / (2 * ((seed % 8) + 8) ** 2));
        const val = Math.max(
          0,
          Math.min(
            255,
            brightness - 80 * (eye1 + eye2 + nose * 0.7 + mouth * 0.8) + Math.sin(x * seed * 0.1) * 15
          )
        );
        data[idx] = val;
        data[idx + 1] = val * 0.85;
        data[idx + 2] = val * 0.75;
        data[idx + 3] = 255;
      }
    }

    return {
      width: w,
      height: h,
      getContext: () => ({
        getImageData: () => ({ data, width: w, height: h }),
      }),
    } as unknown as HTMLCanvasElement;
  }

  it('correctly matches same person under lighting variance with highest similarity', async () => {
    const personA_1 = makeFaceCanvas(7, 160);
    const personA_2 = makeFaceCanvas(7, 135);
    const personB = makeFaceCanvas(23, 160);

    const vecA1 = await model.embed(personA_1);
    const vecA2 = await model.embed(personA_2);
    const vecB = await model.embed(personB);

    const sameMatch = evaluateBiometricMatch(vecA1, vecA2);
    const diffMatchB = evaluateBiometricMatch(vecA1, vecB);

    expect(sameMatch.isMatch).toBe(true);
    expect(sameMatch.cosineSimilarity).toBeGreaterThan(diffMatchB.cosineSimilarity);
  });
});
