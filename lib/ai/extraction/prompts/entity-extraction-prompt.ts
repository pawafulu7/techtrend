/**
 * Entity Extraction Prompt
 *
 * Prompt template for extracting technology entities and their relationships
 * from article titles and summaries. Uses structured JSON output.
 */

import { z } from 'zod';
import { ExtractionConfig } from '../llm-extraction-pipeline';
import { parseJSONFromLLM } from '../extraction-schemas';
import logger from '@/lib/logger';

// =============================================================================
// Type Fallback Mapping
// =============================================================================

const VALID_ENTITY_TYPES = [
  'FRAMEWORK',
  'LANGUAGE',
  'TOOL',
  'CONCEPT',
  'PLATFORM',
  'LIBRARY',
] as const;
type ValidEntityType = (typeof VALID_ENTITY_TYPES)[number];

const ENTITY_TYPE_FALLBACK: Record<string, ValidEntityType> = {
  ALGORITHM: 'CONCEPT',
  MODEL: 'CONCEPT',
  DATASET: 'CONCEPT',
  PROTOCOL: 'CONCEPT',
  ORGANIZATION: 'PLATFORM',
  SERVICE: 'PLATFORM',
};

function mapEntityType(raw: string): ValidEntityType {
  const upper = raw.trim().toUpperCase();
  if ((VALID_ENTITY_TYPES as readonly string[]).includes(upper))
    return upper as ValidEntityType;
  return ENTITY_TYPE_FALLBACK[upper] ?? 'CONCEPT';
}

const VALID_RELATION_TYPES = [
  'DEPENDS_ON',
  'ALTERNATIVE',
  'EVOLUTION',
  'PART_OF',
  'INTEGRATES_WITH',
] as const;
type ValidRelationType = (typeof VALID_RELATION_TYPES)[number];

const RELATION_TYPE_FALLBACK: Record<string, ValidRelationType> = {
  USES: 'DEPENDS_ON',
  APPLIED_TO: 'DEPENDS_ON',
  TARGETS: 'DEPENDS_ON',
  PROCESSES: 'DEPENDS_ON',
  IMPROVES: 'EVOLUTION',
  OPTIMIZES: 'EVOLUTION',
  EXTENDS: 'EVOLUTION',
  EXTENDED_TO: 'EVOLUTION',
  INTRODUCES: 'PART_OF',
  DERIVED_FROM: 'PART_OF',
  IS_A: 'PART_OF',
  BENEFITS_FROM: 'INTEGRATES_WITH',
  CASE_STUDY: 'INTEGRATES_WITH',
};

function mapRelationType(raw: string): ValidRelationType {
  const upper = raw.trim().toUpperCase();
  if ((VALID_RELATION_TYPES as readonly string[]).includes(upper))
    return upper as ValidRelationType;
  return RELATION_TYPE_FALLBACK[upper] ?? 'INTEGRATES_WITH';
}

// =============================================================================
// Schema
// =============================================================================

export const ExtractedEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().transform(mapEntityType),
  aliases: z.array(z.string()),
  github: z.string().nullable().optional(),
  npm: z.string().nullable().optional(),
  pypi: z.string().nullable().optional(),
});

export const ExtractedRelationSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().transform(mapRelationType),
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

Entity types (use ONLY these exact values): FRAMEWORK, LANGUAGE, TOOL, CONCEPT, PLATFORM, LIBRARY
- If unsure about the type, use CONCEPT
Relation types (use ONLY these exact values): DEPENDS_ON, ALTERNATIVE, EVOLUTION, PART_OF, INTEGRATES_WITH
- If unsure about the relation, use INTEGRATES_WITH
- For github/npm/pypi: use empty string "" if unknown (do not use null)
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
  const normalized = {
    entities: normalizedEntities,
    relations: Array.isArray(raw.relations) ? raw.relations : [],
    mentions: Array.isArray(raw.mentions) ? raw.mentions : [],
  };

  try {
    return EntityExtractionOutputSchema.parse(normalized);
  } catch (error) {
    logger.error(
      { context: 'EntityExtraction', error },
      'Schema validation failed, returning empty result'
    );
    return { entities: [], relations: [], mentions: [] };
  }
}

// =============================================================================
// Config Export
// =============================================================================

export const ENTITY_EXTRACTION_PROMPT_VERSION = '1.1';

export const entityExtractionConfig: ExtractionConfig<EntityExtractionOutput> =
  {
    schema:
      EntityExtractionOutputSchema as unknown as z.ZodType<EntityExtractionOutput>,
    promptVersion: ENTITY_EXTRACTION_PROMPT_VERSION,
    buildPrompt: buildEntityExtractionPrompt,
    parseResponse: parseEntityExtractionResponse,
  };
