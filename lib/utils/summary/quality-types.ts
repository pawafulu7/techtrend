/**
 * Shared types for summary quality checking module.
 *
 * Extracted to break circular dependencies between
 * summary-quality-checker and quality-scorer.
 */

import { ContentAnalysis as BaseContentAnalysis } from '../content/content-analyzer';
import type { SpeculativeExpressionResult } from './quality-rules';

// Re-export for convenience
export type { SpeculativeExpressionResult } from './quality-rules';

// ContentAnalysisを拡張して互換性を保つ
export interface ContentAnalysis extends BaseContentAnalysis {
  totalLength?: number; // 追加フィールド（オプション）
}

export interface QualityCheckResult {
  isValid: boolean;
  issues: QualityIssue[];
  requiresRegeneration: boolean;
  score: number;
  speculativeExpressions?: SpeculativeExpressionResult;
  itemCount?: number; // 項目数
  itemCountValid?: boolean; // 項目数が基準を満たしているか
}

export interface QualityIssue {
  type:
    | 'length'
    | 'format'
    | 'punctuation'
    | 'speculative'
    | 'duplicate'
    | 'itemCount'; // itemCountを追加
  severity: 'critical' | 'major' | 'minor';
  message: string;
}
