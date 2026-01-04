/**
 * Diff Summary Module
 *
 * Weekly topic diff analysis for each source category.
 */

export {
  DiffSummaryService,
  getDiffSummaryService,
  resetDiffSummaryService,
  getISOWeek,
  getPreviousISOWeek,
  getWeekDateRange,
} from './diff-summary-service';

export type { DiffSummaryServiceOptions } from './diff-summary-service';
