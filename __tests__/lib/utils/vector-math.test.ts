import { cosineSimilarity, cosineSimilarityDetailed } from '@/lib/utils/vector-math';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1.0);
  });

  it('should throw for different dimensions', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
      'Vector dimensions must match'
    );
  });

  it('should throw for empty vectors', () => {
    expect(() => cosineSimilarity([], [])).toThrow('Vectors must not be empty');
  });

  it('should return 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
  });

  it('should handle high-dimensional vectors (1536-dim)', () => {
    const vec1 = Array(1536)
      .fill(0)
      .map(() => Math.random());
    const vec2 = Array(1536)
      .fill(0)
      .map(() => Math.random());

    const result = cosineSimilarity(vec1, vec2);

    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('should calculate correct similarity for simple vectors', () => {
    const result = cosineSimilarity([1, 0, 0], [1, 0, 0]);
    expect(result).toBeCloseTo(1.0);
  });

  it('should calculate correct similarity for partially similar vectors', () => {
    const result = cosineSimilarity([1, 1], [1, 0]);
    expect(result).toBeCloseTo(0.7071, 4);
  });
});

describe('cosineSimilarityDetailed', () => {
  it('should return detailed results', () => {
    const result = cosineSimilarityDetailed([1, 0, 0], [1, 0, 0]);

    expect(result.similarity).toBeCloseTo(1.0);
    expect(result.magnitude1).toBeCloseTo(1.0);
    expect(result.magnitude2).toBeCloseTo(1.0);
    expect(result.dotProduct).toBe(1.0);
  });

  it('should handle zero vectors in detailed version', () => {
    const result = cosineSimilarityDetailed([0, 0], [1, 2]);

    expect(result.similarity).toBe(0);
    expect(result.magnitude1).toBe(0);
    expect(result.magnitude2).toBeCloseTo(Math.sqrt(5));
    expect(result.dotProduct).toBe(0);
  });

  it('should throw for dimension mismatch in detailed version', () => {
    expect(() => cosineSimilarityDetailed([1, 2], [1, 2, 3])).toThrow();
  });
});
