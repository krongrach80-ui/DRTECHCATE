/**
 * packages/face-client/src/embed.ts
 * Face Embedding Extraction & Vector Math per Master Prompt v3 Section 7.1.2 & 7.1.3
 * Runs ONNX Runtime Web with local model weights (/models/...) in WASM mode.
 * Architecture Invariant:
 * - Converts 112x112 face canvas to Float32Array NCHW [1, 3, 112, 112] with (pixel - 127.5) / 128.0
 * - Fail-closed: Throws MODEL_WEIGHTS_NOT_INSTALLED if model weights are missing.
 * - Memory Wipe: Flushes Float32Array buffer with .fill(0) immediately after inference.
 */

export interface EmbeddingModel {
  name: string;
  version: string;
  dim: number;
  embed(alignedFace: HTMLCanvasElement | ImageData): Promise<number[]>;
  close?(): Promise<void>;
}

/**
 * Normalizes vector to unit length (L2 norm = 1.0)
 */
export function l2Normalize(vector: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return new Array(vector.length).fill(0);
  return vector.map((v) => v / norm);
}

/**
 * Computes arithmetic mean across multiple normalized vectors and re-normalizes (probe generation)
 */
export function averageAndNormalize(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const avg = new Array(dim).fill(0);

  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      avg[i] += vec[i];
    }
  }

  const normalizedAvg = avg.map((v) => v / vectors.length);
  return l2Normalize(normalizedAvg);
}

/**
 * Computes Cosine Similarity between two unit-normalized vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct;
}

/**
 * Converts a 112x112 HTMLCanvasElement or ImageData to a normalized Float32Array in NCHW format [1, 3, 112, 112].
 * Applies standard ArcFace normalization: (pixel - 127.5) / 128.0
 */
export function canvasToNchwTensor(
  source: HTMLCanvasElement | ImageData,
  width: number = 112,
  height: number = 112
): Float32Array {
  let data: Uint8ClampedArray;
  if ('data' in source) {
    data = source.data;
  } else {
    const ctx = source.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context for canvasToNchwTensor');
    }
    const imgData = ctx.getImageData(0, 0, width, height);
    data = imgData.data;
  }

  const channelSize = width * height;
  // Shape: 1 x 3 x 112 x 112 -> 37,632 floats
  const tensorData = new Float32Array(3 * channelSize);

  for (let i = 0; i < channelSize; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    // Channel 0: Red
    tensorData[i] = (r - 127.5) / 128.0;
    // Channel 1: Green
    tensorData[channelSize + i] = (g - 127.5) / 128.0;
    // Channel 2: Blue
    tensorData[2 * channelSize + i] = (b - 127.5) / 128.0;
  }

  return tensorData;
}

/**
 * Production ONNX Runtime Web Embedding Model
 * Executes ArcFace 512-D ONNX model locally in WASM.
 */
export class OnnxEmbeddingModel implements EmbeddingModel {
  public readonly name: string = 'arcface-r50-onnx';
  public readonly version: string = 'w600k_r50';
  public readonly dim: number = 512;
  private session: any = null;
  private modelUrl: string;

  constructor(modelUrl: string = '/models/w600k_r50.onnx') {
    this.modelUrl = modelUrl;
  }

  public async initialize(): Promise<void> {
    if (this.session) return;
    try {
      const ort = await import('onnxruntime-web');
      this.session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ['wasm'],
      });
    } catch (err: any) {
      throw new Error(
        `MODEL_WEIGHTS_NOT_INSTALLED: Could not load ONNX model weights from ${this.modelUrl}. ` +
          `Please ensure the model file is installed in the public /models/ directory. (${err?.message || err})`
      );
    }
  }

  public async embed(alignedFace: HTMLCanvasElement | ImageData): Promise<number[]> {
    if (!this.session) {
      await this.initialize();
    }

    const ort = await import('onnxruntime-web');
    const tensorData = canvasToNchwTensor(alignedFace, 112, 112);

    try {
      const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, 112, 112]);
      const inputName = this.session.inputNames ? this.session.inputNames[0] : 'data';
      const outputName = this.session.outputNames ? this.session.outputNames[0] : 'fc1';

      const feeds: Record<string, any> = {};
      feeds[inputName] = inputTensor;

      const results = await this.session.run(feeds);
      const outputTensor = results[outputName];
      if (!outputTensor || !outputTensor.data) {
        throw new Error('ONNX inference failed: Model output tensor is empty');
      }

      const rawVec = Array.from(outputTensor.data as Float32Array).slice(0, 512);
      return l2Normalize(rawVec);
    } finally {
      // Rule 2.5: Zero out intermediate tensor buffer immediately
      tensorData.fill(0);
    }
  }

  public async close(): Promise<void> {
    if (this.session?.release) {
      await this.session.release();
    }
    this.session = null;
  }
}
