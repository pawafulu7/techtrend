/**
 * Diff Summary Module
 *
 * Weekly topic diff analysis for each source category.
 *
 * NOTE: This barrel re-exports server-only symbols (DiffSummaryService etc.)
 * which transitively pull in `lib/prisma`. Client Components MUST NOT import
 * from this barrel — import pure utilities from `./iso-week` directly instead.
 */

export {
  DiffSummaryService,
  getDiffSummaryService,
  resetDiffSummaryService,
} from './diff-summary-service';

export type { DiffSummaryServiceOptions } from './diff-summary-service';

export {
  getISOWeek,
  getPreviousISOWeek,
  getNextISOWeek,
  getWeekDateRange,
} from './iso-week';
