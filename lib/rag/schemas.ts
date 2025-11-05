import { z } from 'zod';

/**
 * Input validation schemas for RAG operations
 *
 * All user inputs are validated with Zod to prevent:
 * - SQL injection (via parameter limits)
 * - Resource exhaustion (via topK limits)
 * - Invalid API calls (via schema validation)
 *
 * @see .claude/docs/plan/plan_20251018_104352_577_mastra-rag-final-secure.md:543-603
 */

/**
 * Search options schema for internal use
 *
 * Validates parameters for vector search operations
 */
export const searchOptionsSchema = z.object({
  topK: z.coerce
    .number()
    .int('topK must be an integer')
    .min(1, 'topK must be at least 1')
    .max(100, 'topK cannot exceed 100')
    .default(10),

  similarityThreshold: z.coerce
    .number()
    .min(0, 'Similarity threshold must be between 0 and 1')
    .max(1, 'Similarity threshold must be between 0 and 1')
    .default(0.5),  // Lowered from 0.7 to improve recall for short queries

  sourceIds: z
    .array(
      z.string()
        .cuid('Invalid source ID format')
        .transform((id) => id.trim())
    )
    .max(50, 'Too many source filters (max 50)')
    .refine(
      (arr) => new Set(arr).size === arr.length,
      'Duplicate source IDs are not allowed'
    )
    .optional(),

  tags: z
    .array(
      z.string()
        .trim()
        .min(1, 'Tag cannot be empty')
        .max(50, 'Tag name too long (max 50 characters)')
    )
    .max(20, 'Too many tag filters (max 20)')
    .refine(
      (arr) => new Set(arr).size === arr.length,
      'Duplicate tags are not allowed'
    )
    .optional(),

  embeddingKey: z
    .enum(['title', 'summary', 'both'])
    .default('summary'),

  /**
   * Date range filter for temporal queries
   *
   * Both `from` and `to` must be in ISO 8601 format (UTC).
   * If only `from` is specified, returns articles published after that date.
   * If only `to` is specified, returns articles published before that date.
   *
   * @example
   * // Last 30 days
   * { from: "2025-09-25T00:00:00.000Z" }
   *
   * // Specific week
   * { from: "2025-10-18T00:00:00.000Z", to: "2025-10-25T00:00:00.000Z" }
   */
  dateRange: z
    .object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .optional()
    .refine(
      (range) => {
        if (!range || (!range.from && !range.to)) return true;
        if (!range.from || !range.to) return true;
        return new Date(range.from) <= new Date(range.to);
      },
      'dateRange.from must be before or equal to dateRange.to'
    ),

  /**
   * Recency boost weight (0-1)
   *
   * Controls hybrid scoring: similarity * (1 + recencyBoost * time_decay)
   * - 0 (default): Pure similarity ranking (no recency)
   * - 0.3-0.4 (recommended): Balanced similarity + recency
   * - 1: Maximum recency influence
   *
   * Time decay: Exponential with 30-day half-life
   */
  recencyBoost: z.coerce
    .number()
    .min(0, 'recencyBoost must be between 0 and 1')
    .max(1, 'recencyBoost must be between 0 and 1')
    .default(0),
});

// Separate input and output types for Zod v3 compatibility
export type SearchOptionsInput = z.input<typeof searchOptionsSchema>;
export type SearchOptions = z.output<typeof searchOptionsSchema>;

/**
 * Search request schema for API endpoint
 *
 * Validates incoming POST /api/rag/search requests
 */
export const searchRequestSchema = z
  .object({
    query: z
      .string()
      .min(1, 'Query cannot be empty')
      .max(500, 'Query too long (max 500 characters)')
      .transform((q) => q.trim())
      .refine((q) => q.length > 0, 'Query cannot be empty after trimming'),

    topK: z.coerce.number()
      .int('topK must be an integer')
      .min(1, 'topK must be at least 1')
      .max(100, 'topK cannot exceed 100')
      .optional(),
    
    similarityThreshold: z.coerce.number()
      .min(0, 'similarityThreshold must be at least 0')
      .max(1, 'similarityThreshold cannot exceed 1')
      .optional(),

    filters: z
      .object({
        sources: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      })
      .partial()
      .strict()
      .default({}),

    embeddingKey: z.enum(['title', 'summary', 'both']).optional(),
  })
  .strict();;

export type SearchRequest = z.infer<typeof searchRequestSchema>;

/**
 * Embedding schema for runtime validation
 *
 * Validates OpenAI API embedding responses
 * - Must be exactly 1536 dimensions (text-embedding-3-small)
 * - All values must be finite numbers
 * - Values should be normalized (abs <= 1)
 */
export const embeddingSchema = z
  .array(z.number())
  .length(1536, 'Embedding must have exactly 1536 dimensions')
  .refine(
    (arr) => arr.every((n) => Number.isFinite(n)),
    'All embedding values must be finite numbers'
  )
  .refine(
    (arr) => arr.every((n) => Math.abs(n) <= 1),
    'Embedding values must be normalized (abs <= 1)'
  );

export type Embedding = z.infer<typeof embeddingSchema>;
