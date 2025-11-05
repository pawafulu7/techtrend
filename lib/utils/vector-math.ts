export interface VectorMathResult {
  similarity: number;
  magnitude1: number;
  magnitude2: number;
  dotProduct: number;
}

export function cosineSimilarity(
  vector1: number[],
  vector2: number[]
): number {
  if (vector1.length !== vector2.length) {
    throw new Error(
      `Vector dimensions must match: ${vector1.length} vs ${vector2.length}`
    );
  }

  if (vector1.length === 0) {
    throw new Error('Vectors must not be empty');
  }

  let dotProduct = 0;
  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i];
  }

  let magnitude1 = 0;
  let magnitude2 = 0;
  for (let i = 0; i < vector1.length; i++) {
    magnitude1 += vector1[i] * vector1[i];
    magnitude2 += vector2[i] * vector2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

export function cosineSimilarityDetailed(
  vector1: number[],
  vector2: number[]
): VectorMathResult {
  if (vector1.length !== vector2.length) {
    throw new Error(
      `Vector dimensions must match: ${vector1.length} vs ${vector2.length}`
    );
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    magnitude1 += vector1[i] * vector1[i];
    magnitude2 += vector2[i] * vector2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  const similarity =
    magnitude1 === 0 || magnitude2 === 0
      ? 0
      : dotProduct / (magnitude1 * magnitude2);

  return {
    similarity,
    magnitude1,
    magnitude2,
    dotProduct,
  };
}
