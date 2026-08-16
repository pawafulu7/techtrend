import type { DetailPolicy } from '../adapter/summary-provider.interface';
export interface QualityIssue {
  type: 'length' | 'format' | 'punctuation' | 'speculative' | 'duplicate' | 'itemCount';
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
    /**
     * プロンプト生成時に使った詳細度ポリシー。
     * 指定しないと常に 'medium' の範囲で検証するため、
     * 'long' で生成した項目数が範囲外と判定される。
     */
    detailPolicy?: DetailPolicy
  ): QualityCheckResult;

  calculateScore(
    summary: string,
    detailedSummary: string,
    speculativeWeight?: number
  ): number;
}