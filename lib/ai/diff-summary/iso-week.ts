/**
 * ISO Week Utilities
 *
 * Pure date utility functions (no side effects, no server-only dependencies).
 *
 * IMPORTANT: This module is safe to import from Client Components.
 * Always import these helpers from `@/lib/ai/diff-summary/iso-week` directly.
 * Importing them via the barrel `@/lib/ai/diff-summary` from a Client Component
 * pulls in `diff-summary-service` (which transitively imports `lib/prisma` →
 * `pg` → Node.js `dns`) and breaks the client bundle build.
 */

import { getISOWeek as getDateFnsISOWeek, getISOWeekYear } from 'date-fns';

/**
 * Parse and validate an ISO week string (e.g. "2026-W04").
 * Throws on malformed input or out-of-range week numbers (must be 1..53).
 */
function parseISOWeek(isoWeek: string): { year: number; week: number } {
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO week format: ${isoWeek}`);

  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  if (week < 1 || week > 53) {
    throw new Error(`Invalid ISO week number: ${isoWeek}`);
  }
  return { year, week };
}

/**
 * ISO week format helper
 * Uses date-fns for accurate DST handling
 */
export function getISOWeek(date: Date): string {
  const weekNum = getDateFnsISOWeek(date);
  const year = getISOWeekYear(date);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Get the previous ISO week
 */
export function getPreviousISOWeek(isoWeek: string): string {
  const { year, week } = parseISOWeek(isoWeek);

  if (week === 1) {
    // Go to last week of previous year (52 or 53)
    // Dec 28 is always in the last week of its year per ISO 8601
    const prevYear = year - 1;
    const dec28 = new Date(prevYear, 11, 28);
    return getISOWeek(dec28);
  }

  return `${year}-W${(week - 1).toString().padStart(2, '0')}`;
}

/**
 * Get the next ISO week
 */
export function getNextISOWeek(isoWeek: string): string {
  const { year, week } = parseISOWeek(isoWeek);

  // Check if this year has 53 weeks by checking if Dec 28 is in week 53
  const dec28 = new Date(year, 11, 28);
  const lastWeek = getDateFnsISOWeek(dec28);

  if (week >= lastWeek) {
    return `${year + 1}-W01`;
  }

  return `${year}-W${(week + 1).toString().padStart(2, '0')}`;
}

/**
 * Get date range for an ISO week (UTC boundaries).
 *
 * Returns start/end as exact UTC midnight / 23:59:59.999 boundaries so that
 * Prisma queries comparing UTC-stored timestamps don't drift across server
 * timezones.
 */
export function getWeekDateRange(isoWeek: string): { start: Date; end: Date } {
  const { year, week } = parseISOWeek(isoWeek);

  // Find the first Monday of the ISO year using UTC math
  // (Jan 4 is always in ISO week 1 by definition)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);

  // Monday of the target week
  const start = new Date(firstMonday);
  start.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);
  start.setUTCHours(0, 0, 0, 0);

  // Sunday of the target week
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}
