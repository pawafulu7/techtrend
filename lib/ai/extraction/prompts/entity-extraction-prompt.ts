/**
 * Entity Extraction Prompt
 *
 * Prompt template for extracting technology entities and their relationships
 * from article titles and summaries. Uses structured JSON output.
 */

import { z } from 'zod';
import { ExtractionConfig } from '../llm-extraction-pipeline';
import { parseJSONFromLLM } from '../extraction-schemas';

// =============================================================================
// Schema
// =============================================================================

export const ExtractedEntitySchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    'FRAMEWORK',
    'LANGUAGE',
    'TOOL',
    'CONCEPT',
    'PLATFORM',
    'LIBRARY',
  ]),
  aliases: z.array(z.string()),
  github: z.string().optional(),
  npm: z.string().optional(),
});

export const ExtractedRelationSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.enum([
    'DEPENDS_ON',
    'ALTERNATIVE',
    'EVOLUTION',
    'PART_OF',
    'INTEGRATES_WITH',
  ]),
});

export const ExtractedMentionSchema = z.object({
  entity: z.string().min(1),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']),
  context: z.string().max(200).optional(),
});

export const EntityExtractionOutputSchema = z.object({
  entities: z.array(ExtractedEntitySchema),
  relations: z.array(ExtractedRelationSchema),
  mentions: z.array(ExtractedMentionSchema),
});

export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;
export type ExtractedRelation = z.infer<typeof ExtractedRelationSchema>;
export type ExtractedMention = z.infer<typeof ExtractedMentionSchema>;
export type EntityExtractionOutput = z.infer<
  typeof EntityExtractionOutputSchema
>;

// =============================================================================
// Input
// =============================================================================

export interface EntityExtractionInput {
  title: string;
  summary: string;
}

// =============================================================================
// Prompt Builder
// =============================================================================

function validateEntityExtractionInput(input: unknown): EntityExtractionInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: expected an object');
  }

  const data = input as Record<string, unknown>;

  if (typeof data.title !== 'string' || !data.title) {
    throw new Error('Invalid input: title is required');
  }
  if (typeof data.summary !== 'string' || !data.summary) {
    throw new Error('Invalid input: summary is required');
  }

  return data as unknown as EntityExtractionInput;
}

function buildEntityExtractionPrompt(input: unknown): string {
  const data = validateEntityExtractionInput(input);

  return `Given this tech article, extract technology entities and their relationships.

Article title: ${data.title}
Article summary: ${data.summary}

Return JSON:
{
  "entities": [
    { "name": "Next.js", "type": "FRAMEWORK", "aliases": ["nextjs", "Next"], "github": "vercel/next.js", "npm": "next" }
  ],
  "relations": [
    { "source": "Next.js", "target": "React", "type": "DEPENDS_ON" }
  ],
  "mentions": [
    { "entity": "Next.js", "sentiment": "POSITIVE", "context": "Next.js enables fast SSR..." }
  ]
}

Entity types: FRAMEWORK, LANGUAGE, TOOL, CONCEPT, PLATFORM, LIBRARY
Relation types: DEPENDS_ON, ALTERNATIVE, EVOLUTION, PART_OF, INTEGRATES_WITH
Sentiment: POSITIVE, NEUTRAL, NEGATIVE

Important:
- Include github repo (owner/repo format) and npm/pypi package names when identifiable
- Only extract actual technology entities, not generic terms
- Context should be a brief relevant excerpt (max 200 chars)
- Return valid JSON only. No markdown or explanations.`;
}

// =============================================================================
// Parser
// =============================================================================

function parseEntityExtractionResponse(text: string): EntityExtractionOutput {
  const raw = parseJSONFromLLM<Record<string, unknown>>(text);
  // Ensure optional arrays have defaults before schema validation
  const entities = Array.isArray(raw.entities) ? raw.entities : [];
  // Normalize entity aliases: LLM may omit aliases field
  const normalizedEntities = entities.map((e: Record<string, unknown>) => ({
    ...e,
    aliases: Array.isArray(e.aliases) ? e.aliases : [],
  }));
  return {
    entities: normalizedEntities,
    relations: Array.isArray(raw.relations) ? raw.relations : [],
    mentions: Array.isArray(raw.mentions) ? raw.mentions : [],
  } as EntityExtractionOutput;
}

// =============================================================================
// Config Export
// =============================================================================

export const ENTITY_EXTRACTION_PROMPT_VERSION = '1.0';

export const entityExtractionConfig: ExtractionConfig<EntityExtractionOutput> =
  {
    schema: EntityExtractionOutputSchema,
    promptVersion: ENTITY_EXTRACTION_PROMPT_VERSION,
    buildPrompt: buildEntityExtractionPrompt,
    parseResponse: parseEntityExtractionResponse,
  };
