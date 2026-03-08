/**
 * Shared types for summary generation module.
 *
 * Extracted to break circular dependencies between
 * summary-manager, summary-orchestrator, and batch-processor.
 */

export interface SummaryGenerationOptions {
  /** Source filter by name */
  source?: string;
  /** Maximum articles to process in generateSummaries (default: 50) */
  limit?: number;
  /** Force processing regardless of checks */
  force?: boolean;
  /** Maximum articles to process in regenerate/missing flows (default: 10) */
  batch?: number;
  /** Days to look back: generateSummaries default=1, generateMissingSummaries default=7 */
  days?: number;
  /** Specific article IDs to regenerate */
  articleIds?: string[];
}

export interface SummaryGenerationResult {
  generated: number;
  errors: number;
  skipped?: number;
}

export interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  translatedTitle?: string;
  tags: string[] | null;
}
