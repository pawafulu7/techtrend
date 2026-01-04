/**
 * Prompt Version Management
 *
 * Centralized version tracking for all extraction prompts.
 * Increment version when prompt logic changes significantly.
 */

export type PromptType = 'diff-summary' | 'viewpoint-map' | 'code-tips';

/**
 * Current prompt versions
 *
 * Version format: MAJOR.MINOR
 * - MAJOR: Breaking changes to output structure
 * - MINOR: Improvements to prompt quality
 */
export const PROMPT_VERSIONS: Record<PromptType, string> = {
  'diff-summary': '1.0',
  'viewpoint-map': '1.0',
  'code-tips': '1.0',
};

/**
 * Get the current version for a prompt type
 */
export function getPromptVersion(type: PromptType): string {
  return PROMPT_VERSIONS[type];
}

/**
 * Prompt version changelog (for documentation)
 *
 * diff-summary:
 *   1.0 - Initial version with change detection and categorization
 *
 * viewpoint-map:
 *   1.0 - Initial version with issue extraction and stance analysis
 *
 * code-tips:
 *   1.0 - Initial version with code block extraction and quality scoring
 */
