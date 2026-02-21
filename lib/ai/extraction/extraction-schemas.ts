/**
 * Extraction Schemas
 *
 * Zod schemas for validating LLM extraction outputs
 */

import { createHash } from 'crypto';
import { z } from 'zod';

// =============================================================================
// Diff Summary Schema (Feature 4)
// =============================================================================

export const DiffChangeSchema = z.object({
  type: z.enum(['new', 'updated', 'deprecated', 'trending']),
  topic: z.string().min(1),
  description: z.string().min(30),
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
 * Extract balanced JSON object from text
 * Handles nested braces correctly
 */
function extractBalancedJSON(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') depth++;
      if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Sanitize invalid JSON escape sequences (e.g. LaTeX \ell, \alpha)
 * Valid JSON escapes: \" \\ \/ \b \f \n \r \t \uXXXX
 */
function sanitizeJsonEscapes(text: string): string {
  return text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}

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

  // Try to parse as JSON directly
  try {
    return JSON.parse(cleanText) as T;
  } catch {
    // Retry with sanitized escapes (fixes LaTeX \ell, \alpha etc.)
    try {
      return JSON.parse(sanitizeJsonEscapes(cleanText)) as T;
    } catch {
      // Try to extract balanced JSON object from text
      const jsonStr = extractBalancedJSON(cleanText);
      if (jsonStr) {
        try {
          return JSON.parse(jsonStr) as T;
        } catch {
          try {
            return JSON.parse(sanitizeJsonEscapes(jsonStr)) as T;
          } catch (e) {
            throw new Error(
              `Failed to parse extracted JSON: ${e instanceof Error ? e.message : 'Unknown error'}`
            );
          }
        }
      }
      throw new Error(
        'Failed to parse JSON from LLM response: No valid JSON found'
      );
    }
  }
}

/**
 * Create a SHA-256 hash for code deduplication
 *
 * Uses Node.js crypto module for robust collision resistance.
 * Normalizes whitespace before hashing to ensure consistent deduplication.
 */
export function createCodeHash(code: string): string {
  // Normalize whitespace for consistent hashing
  const normalized = code.replace(/\s+/g, ' ').trim().toLowerCase();

  // Use SHA-256 for robust collision resistance
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
