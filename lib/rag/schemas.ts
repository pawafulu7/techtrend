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
    .refine(
      (value) => value >= 0 && value <= 1,
      'Similarity threshold must be a valid number between 0 and 1'
    )
    .default(0.7),

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
        .min(1, 'Tag cannot be empty')
        .max(50, 'Tag name too long (max 50 characters)')
        .transform((tag) => tag.trim())
    )
    .max(20, 'Too many tag filters (max 20)')
    .refine(
      (arr) => arr.every((tag) => tag.length > 0),
      'Empty tags are not allowed after trimming'
    )
    .refine(
      (arr) => new Set(arr).size === arr.length,
      'Duplicate tags are not allowed'
    )
    .optional(),

  embeddingKey: z
    .enum(['title', 'summary', 'both'])
    .default('summary'),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;

/**
 * Search request schema for API endpoint
 *
 * Validates incoming POST /api/rag/search requests
 */
export const searchRequestSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(500, 'Query too long (max 500 characters)')
    .transform((q) => q.trim())
    .refine(
      (q) => q.length > 0,
      'Query cannot be empty after trimming'
    ),

  topK: z.coerce.number().optional(),
  similarityThreshold: z.coerce.number().optional(),

  filters: z
    .object({
      sources: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    })
    .partial()
    .strict()
    .default({}),

  embeddingKey: z.enum(['title', 'summary', 'both']).optional(),
});

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
