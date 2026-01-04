/**
 * Diff Summary Prompt
 *
 * Prompt template for detecting topic changes between periods.
 * Uses structured JSON input/output for reliable parsing.
 */

import { ExtractionConfig } from '../llm-extraction-pipeline';
import {
  DiffSummaryOutput,
  DiffSummaryOutputSchema,
  parseJSONFromLLM,
} from '../extraction-schemas';
import { getPromptVersion } from '../prompt-versions';

/**
 * Input structure for diff summary extraction
 */
export interface DiffSummaryInput {
  category: string;
  categoryName: string;
  currentPeriod: string; // ISO week format: "2026-W01"
  baselinePeriod: string; // ISO week format: "2025-W52"
  currentTopics: TopicData[];
  baselineTopics: TopicData[];
}

export interface TopicData {
  topic: string;
  count: number;
  articleIds: string[];
  headlines: string[];
}

/**
 * Build the diff summary prompt
 */
function buildDiffSummaryPrompt(input: unknown): string {
  const data = input as DiffSummaryInput;

  return `You are a technology trend analyst. Analyze the topic changes between two time periods.

## Input Data
Category: ${data.category} (${data.categoryName})
Current Period: ${data.currentPeriod}
Baseline Period: ${data.baselinePeriod}

### Current Period Topics (${data.currentPeriod}):
${JSON.stringify(data.currentTopics, null, 2)}

### Baseline Period Topics (${data.baselinePeriod}):
${JSON.stringify(data.baselineTopics, null, 2)}

## Classification Rules
Compare topics between the two periods using these rules:

1. **new**: Topic appears ONLY in current period (not in baseline)
2. **deprecated**: Topic appears ONLY in baseline period (not in current)
3. **trending**: Topic exists in both AND (currentCount >= baselineCount * 1.5 OR currentCount >= baselineCount + 3)
4. **updated**: Topic exists in both with notable focus change (evident from headlines)
5. **unchanged**: Topic exists in both with minimal change

## Topic Matching Rules
- Normalize topic names (ignore case, extra spaces)
- Merge clear synonyms (e.g., "React.js" = "React", "TypeScript" = "TS")
- Use headline context to determine if focus has shifted

## Output Requirements
Respond with ONLY a valid JSON object matching this schema:
{
  "changes": [
    {
      "type": "new" | "updated" | "deprecated" | "trending",
      "topic": "Topic name",
      "description": "Brief explanation of the change (min 10 chars)",
      "significance": "high" | "medium" | "low",
      "relatedArticleIds": ["article_id_1", "article_id_2"] // optional
    }
  ],
  "unchanged": ["Topic 1", "Topic 2"], // List of unchanged topic names
  "summary": "50-500 char summary of overall changes in this category",
  "keyTakeaways": ["Takeaway 1", "Takeaway 2"] // 1-5 key insights
}

## Important
- Use ONLY the provided data. Do NOT use external knowledge.
- Output ONLY valid JSON. No markdown, no explanations.
- Focus on technically significant changes relevant to developers.
- Japanese topic names and descriptions are acceptable if the source data is Japanese.`;
}

/**
 * Parse the LLM response into DiffSummaryOutput
 */
function parseDiffSummaryResponse(text: string): DiffSummaryOutput {
  return parseJSONFromLLM<DiffSummaryOutput>(text);
}

/**
 * Extraction configuration for diff summary
 */
export const diffSummaryConfig: ExtractionConfig<DiffSummaryOutput> = {
  schema: DiffSummaryOutputSchema,
  promptVersion: getPromptVersion('diff-summary'),
  buildPrompt: buildDiffSummaryPrompt,
  parseResponse: parseDiffSummaryResponse,
};
