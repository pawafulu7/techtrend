/**
 * Graph Utilities
 *
 * Constants and pure utility functions for graph serialization.
 * Separated from GraphDataSerializer for better maintainability.
 *
 * @see lib/graph/graph-data-serializer.ts
 */

import { CATEGORY_COLORS } from '@/lib/types/graph';

// ============================================================
// Constants
// ============================================================

/**
 * Graph serialization constants.
 *
 * These values are calibrated for visual balance in the relationship graph.
 */
export const GRAPH_CONSTANTS = {
  MIN_QUALITY_SCORE: 4,
  CENTER_NODE_SCALE: 1.4,
  RELATED_NODE_SCALE: 0.85,
  MIN_NODE_SIZE: 30,
  MAX_NODE_SIZE: 140,
  MIN_BRIGHTNESS_FACTOR: 0.7,
  BRIGHTNESS_RANGE: 0.6,
} as const;

/**
 * Category Detection Rules
 *
 * IMPORTANT: Rule order is significant for same-priority items.
 * Do NOT reorder rules without understanding the impact on category detection.
 * Characterization tests (21 snapshots) will catch unintended changes.
 *
 * CodexMCP: Lookup table approach (not regex everywhere)
 */
export const CATEGORY_RULES = [
  {
    keywords: ['React', 'Vue', 'Angular', 'Svelte', 'Frontend', 'UI', 'CSS'],
    category: 'Frontend',
    priority: 10,
  },
  {
    keywords: [
      'AI',
      'ML',
      'LLM',
      'Machine Learning',
      'Deep Learning',
      'Neural',
      'GPT',
      'Gemini',
    ],
    category: 'AI/ML',
    priority: 10,
  },
  {
    keywords: [
      'Node.js',
      'Express',
      'Backend',
      'API',
      'REST',
      'GraphQL',
      'Server',
    ],
    category: 'Backend',
    priority: 9,
  },
  {
    keywords: [
      'DevOps',
      'Docker',
      'Kubernetes',
      'K8s',
      'CI/CD',
      'GitHub Actions',
    ],
    category: 'DevOps',
    priority: 9,
  },
  {
    keywords: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Database', 'SQL'],
    category: 'Database',
    priority: 8,
  },
  {
    keywords: ['Security', 'Auth', 'OAuth', 'JWT', 'XSS', 'CSRF', 'Encryption'],
    category: 'Security',
    priority: 8,
  },
  {
    keywords: ['Test', 'Jest', 'Playwright', 'E2E', 'Unit Test', 'TDD'],
    category: 'Testing',
    priority: 7,
  },
] as const;

export type CategoryRule = (typeof CATEGORY_RULES)[number];

// ============================================================
// Category Functions
// ============================================================

/**
 * Detect category from tags using priority-based matching.
 *
 * Note: Case-sensitive matching (preserves original behavior).
 *
 * @param tags - Array of tag objects with name property
 * @returns Category string (e.g., 'Frontend', 'AI/ML') or 'Other' if no match
 */
export function getCategory(tags: Array<{ name: string }>): string {
  const tagNames = tags.map((t) => t.name);

  let bestMatch: { category: string; priority: number } | null = null;

  for (const rule of CATEGORY_RULES) {
    const matched = rule.keywords.some((keyword) =>
      tagNames.some((tag) => tag.includes(keyword))
    );
    if (matched) {
      const { category, priority } = rule;
      if (!bestMatch || priority > bestMatch.priority) {
        bestMatch = { category, priority };
      }
    }
  }

  return bestMatch?.category ?? 'Other';
}

/**
 * Get color for a category from CATEGORY_COLORS map.
 *
 * @param category - Category string
 * @returns Hex color code
 */
export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
}

// ============================================================
// Color Adjustment Functions
// ============================================================

/**
 * Adjust color brightness for center node.
 *
 * @param color - Base hex color
 * @param _isCenter - Whether this is the center node (unused, kept for API compatibility)
 * @returns Adjusted hex color (unchanged - actual adjustment is done in adjustColorForSimilarity)
 */
export function adjustColorForCenter(
  color: string,
  _isCenter: boolean
): string {
  // Center node keeps original color, related nodes are slightly dimmed
  // (actual adjustment is done in adjustColorForSimilarity based on similarity value)
  return color;
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Convert Date or string to ISO string format.
 *
 * @param date - Date object or ISO date string
 * @returns ISO 8601 formatted string
 */
export function toISOString(date: Date | string): string {
  return date instanceof Date
    ? date.toISOString()
    : new Date(date).toISOString();
}

/**
 * Clamp a value to the range [0, 1].
 *
 * Handles undefined, NaN, and Infinity gracefully.
 *
 * @param value - Number to clamp (may be undefined)
 * @returns Clamped value between 0 and 1
 */
export function clamp01(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  if (!isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

/**
 * Normalize quality score to [0, 1] range.
 *
 * @param score - Raw quality score (0-100 scale)
 * @returns Normalized score between 0 and 1
 */
export function normalizeQualityScore(score: number | undefined): number {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return 0;
  }

  const clamped = Math.max(0, Math.min(100, score));
  return clamp01(clamped / 100);
}
