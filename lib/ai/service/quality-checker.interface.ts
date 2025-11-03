export interface QualityIssue {
  type: 'length' | 'format' | 'punctuation' | 'speculative' | 'duplicate' | 'itemCount' | 'critique-context' | 'critique-audience' | 'critique-value';
  severity: 'critical' | 'major' | 'minor';
  message: string;
}

export interface SpeculativeExpressionResult {
  count: number;
  ratio: number;
  expressions: string[];
}

export interface QualityCheckResult {
  isValid: boolean;
  issues: QualityIssue[];
  requiresRegeneration: boolean;
  score: number;
  speculativeExpressions?: SpeculativeExpressionResult;
  itemCount?: number;
  itemCountValid?: boolean;
  critiqueValid?: boolean;
}

export interface ContentAnalysis {
  contentLength?: number;
  totalLength?: number;
  isThinContent?: boolean;
  recommendedMinLength?: number;
  recommendedMaxLength?: number;
}

export interface QualityChecker {
  checkQuality(
    summary: string,
    detailedSummary: string,
    contentAnalysis?: ContentAnalysis,
    critique?: {
      contextComparison: string;
      recommendedAudience: string;
      valueAssessment: string;
    }
  ): QualityCheckResult;

  calculateScore(
    summary: string,
    detailedSummary: string,
    speculativeWeight?: number
  ): number;
}