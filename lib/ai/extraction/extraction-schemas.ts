/**
 * Extraction Schemas
 *
 * Zod schemas for validating LLM extraction outputs
 */

import { z } from 'zod';

// =============================================================================
// Diff Summary Schema (Feature 4)
// =============================================================================

export const DiffChangeSchema = z.object({
  type: z.enum(['new', 'updated', 'deprecated', 'trending']),
  topic: z.string().min(1),
  description: z.string().min(10),
  significance: z.enum(['high', 'medium', 'low']),
  relatedArticleIds: z.array(z.string()).optional(),
});

export const DiffSummaryOutputSchema = z.object({
  changes: z.array(DiffChangeSchema),
  unchanged: z.array(z.string()),
  summary: z.string().min(50).max(500),
  keyTakeaways: z.array(z.string()).min(1).max(5),
});

export type DiffChange = z.infer<typeof DiffChangeSchema>;
export type DiffSummaryOutput = z.infer<typeof DiffSummaryOutputSchema>;

// =============================================================================
// Viewpoint Map Schema (Feature 5)
// =============================================================================

export const ViewpointIssueSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  positions: z.array(
    z.object({
      stance: z.string().min(1),
      reasoning: z.string().min(10),
      supporters: z.array(z.string()).optional(),
    })
  ),
  consensus: z.string().optional(),
  openQuestions: z.array(z.string()).optional(),
});

export const ViewpointMapOutputSchema = z.object({
  issues: z.array(ViewpointIssueSchema).min(1).max(10),
  overallTheme: z.string().min(20),
  controversyLevel: z.enum(['high', 'medium', 'low', 'consensus']),
});

export type ViewpointIssue = z.infer<typeof ViewpointIssueSchema>;
export type ViewpointMapOutput = z.infer<typeof ViewpointMapOutputSchema>;

// =============================================================================
// Code Tip Schema (Feature 6)
// =============================================================================

export const CodeTipOutputSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(20).max(500),
  code: z.string().min(10),
  language: z.string().min(1),
  tags: z.array(z.string()).min(1).max(10),
  quality: z.number().min(0).max(100),
  useCase: z.string().optional(),
  caveats: z.array(z.string()).optional(),
});

export const CodeTipsExtractionSchema = z.object({
  tips: z.array(CodeTipOutputSchema),
  articleRelevance: z.number().min(0).max(100),
});

export type CodeTipOutput = z.infer<typeof CodeTipOutputSchema>;
export type CodeTipsExtraction = z.infer<typeof CodeTipsExtractionSchema>;

// =============================================================================
// Common Response Parsing Utilities
// =============================================================================

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
export function parseJSONFromLLM<T>(text: string): T {
  // Remove markdown code blocks if present
  let cleanText = text.trim();

  // Handle ```json ... ``` format
  const jsonBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleanText = jsonBlockMatch[1].trim();
  }

  // Try to parse as JSON
  try {
    return JSON.parse(cleanText) as T;
  } catch {
    // Try to extract JSON object/array from text
    const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as T;
    }
    throw new Error('Failed to parse JSON from LLM response');
  }
}

/**
 * Create a hash for code deduplication
 */
export function createCodeHash(code: string): string {
  // Normalize whitespace and create a simple hash
  const normalized = code.replace(/\s+/g, ' ').trim().toLowerCase();

  // Simple hash function (for more robust hashing, use crypto)
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}
