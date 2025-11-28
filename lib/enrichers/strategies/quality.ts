export interface QualityMetrics {
  length: number;
  sentences: number;
  whitespaceRatio: number;
  avgSentenceLength: number;
}

export function evaluateQuality(content: string): QualityMetrics {
  const length = content.length;
  const sentences = content.split(/[.!?。！？]+/).filter(s => s.trim().length > 0);
  const whitespaceCount = (content.match(/\s/g) || []).length;
  const whitespaceRatio = length > 0 ? whitespaceCount / length : 0;
  const avgSentenceLength = sentences.length > 0 ? length / sentences.length : 0;

  return {
    length,
    sentences: sentences.length,
    whitespaceRatio,
    avgSentenceLength,
  };
}

export function isHighQuality(content: string): boolean {
  const metrics = evaluateQuality(content);

  // Readability: 400 chars + high density
  if (
    metrics.length >= 400 &&
    metrics.whitespaceRatio < 0.5 &&
    metrics.sentences >= 3
  ) {
    return true;
  }

  // Legacy strategies: 250-300 chars
  if (metrics.length >= 250 && metrics.sentences >= 2) {
    return true;
  }

  return false;
}

export function isMinimumViable(content: string): boolean {
  return content.length >= 50;
}
