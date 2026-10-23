/**
 * packages/face-client/src/embed.ts
 * Face Embedding Extraction & Vector Math per Master Prompt v3 Section 7.1
 * Interface EmbeddingModel { name, version, dim, embed }
 */

export interface EmbeddingModel {
  name: string;
  version: string;
  dim: number;
  embed(alignedFace: HTMLCanvasElement | ImageData | unknown): Promise<number[]>;
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
 * Generates a synthetic 512-dim unit vector from a seed number or string
 */
export function generateSyntheticVector(seed: number | string, dim: number = 512): number[] {
  const seedNum = typeof seed === 'number' ? seed : seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const raw: number[] = [];
  for (let i = 0; i < dim; i++) {
    // Deterministic pseudo-random based on seed and dimension index
    const val = Math.sin(seedNum * 997 + i * 1337);
    raw.push(val);
  }
  return l2Normalize(raw);
}

/**
 * Mock Embedding Model for testing & development
 */
export class MockEmbeddingModel implements EmbeddingModel {
  name = 'mock-adaface-ir50';
  version = 'adaface-ir50-v1';
  dim = 512;

  constructor(private seed: number | string = 1) {}

  public setSeed(seed: number | string): void {
    this.seed = seed;
  }

  public async embed(_alignedFace: unknown): Promise<number[]> {
    return generateSyntheticVector(this.seed, this.dim);
  }
}
