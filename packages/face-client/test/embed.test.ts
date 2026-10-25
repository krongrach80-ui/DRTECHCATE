import { describe, it, expect } from 'vitest';
import {
  canvasToNchwTensor,
  l2Normalize,
  averageAndNormalize,
  cosineSimilarity,
  OnnxEmbeddingModel,
} from '../src/embed';

describe('[FACE-CLIENT] embed.ts - NCHW Tensor & L2 Vector Normalization', () => {
  describe('1. canvasToNchwTensor', () => {
    it('1.1 should convert RGBA ImageData to Float32Array in NCHW layout with (pixel - 127.5) / 128.0', () => {
      const width = 112;
      const height = 112;
      const channelSize = width * height; // 12,544
      const data = new Uint8ClampedArray(channelSize * 4);

      // Set pixel 0: R=0, G=127.5(~128), B=255, A=255
      data[0] = 0;
      data[1] = 128;
      data[2] = 255;
      data[3] = 255;

      const mockImageData = {
        data,
        width,
        height,
      } as unknown as ImageData;

      const tensor = canvasToNchwTensor(mockImageData, width, height);

      expect(tensor.length).toBe(3 * channelSize); // 37,632 floats

      // Channel 0 (Red) at pixel 0: (0 - 127.5) / 128.0 = -0.99609375
      expect(tensor[0]).toBeCloseTo((0 - 127.5) / 128.0, 4);

      // Channel 1 (Green) at pixel 0: (128 - 127.5) / 128.0 = 0.00390625
      expect(tensor[channelSize + 0]).toBeCloseTo((128 - 127.5) / 128.0, 4);

      // Channel 2 (Blue) at pixel 0: (255 - 127.5) / 128.0 = 0.99609375
      expect(tensor[2 * channelSize + 0]).toBeCloseTo((255 - 127.5) / 128.0, 4);
    });
  });

  describe('2. Vector Math Utilities', () => {
    it('2.1 l2Normalize should produce a unit vector (norm = 1.0)', () => {
      const vec = [3, 4]; // norm = 5
      const normalized = l2Normalize(vec);

      expect(normalized[0]).toBeCloseTo(0.6, 5);
      expect(normalized[1]).toBeCloseTo(0.8, 5);

      const norm = Math.sqrt(normalized[0] * normalized[0] + normalized[1] * normalized[1]);
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('2.2 l2Normalize should return a zero vector when all elements are zero', () => {
      const vec = [0, 0, 0];
      const normalized = l2Normalize(vec);
      expect(normalized).toEqual([0, 0, 0]);
    });

    it('2.3 averageAndNormalize should compute arithmetic mean and unit normalize', () => {
      const v1 = [1, 0];
      const v2 = [0, 1];
      // Mean = [0.5, 0.5] -> L2 Normalized = [1/sqrt(2), 1/sqrt(2)]
      const avg = averageAndNormalize([v1, v2]);

      expect(avg[0]).toBeCloseTo(Math.SQRT1_2, 5);
      expect(avg[1]).toBeCloseTo(Math.SQRT1_2, 5);
    });

    it('2.4 cosineSimilarity should compute accurate dot product of unit vectors', () => {
      const v1 = [1, 0];
      const v2 = [1, 0];
      const v3 = [0, 1];

      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5); // Identical
      expect(cosineSimilarity(v1, v3)).toBeCloseTo(0.0, 5); // Orthogonal
    });
  });

  describe('3. OnnxEmbeddingModel Fail-Closed Contract', () => {
    it('3.1 should throw MODEL_WEIGHTS_NOT_INSTALLED when model file does not exist', async () => {
      const model = new OnnxEmbeddingModel('/models/non_existent_model_weights.onnx');

      await expect(model.initialize()).rejects.toThrow('MODEL_WEIGHTS_NOT_INSTALLED');
    });
  });
});
