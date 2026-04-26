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
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO week format: ${isoWeek}`);

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

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
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO week format: ${isoWeek}`);

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  // Check if this year has 53 weeks by checking if Dec 28 is in week 53
  const dec28 = new Date(year, 11, 28);
  const lastWeek = getDateFnsISOWeek(dec28);

  if (week >= lastWeek) {
    return `${year + 1}-W01`;
  }

  return `${year}-W${(week + 1).toString().padStart(2, '0')}`;
}

/**
 * Get date range for an ISO week
 */
export function getWeekDateRange(isoWeek: string): { start: Date; end: Date } {
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO week format: ${isoWeek}`);

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  // Find the first Thursday of the year
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);

  // Monday of the target week
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (week - 1) * 7);
  start.setHours(0, 0, 0, 0);

  // Sunday of the target week
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
