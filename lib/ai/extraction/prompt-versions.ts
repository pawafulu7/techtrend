/**
 * Prompt Version Management
 *
 * Centralized version tracking for all extraction prompts.
 * Increment version when prompt logic changes significantly.
 */

export type PromptType = 'diff-summary' | 'viewpoint-map' | 'code-tips';

/**
 * Version history entry
 */
interface VersionHistoryEntry {
  version: string;
  date: string;
  description: string;
}

/**
 * Prompt version metadata with change history
 */
interface PromptVersionInfo {
  current: string;
  history: VersionHistoryEntry[];
}

/**
 * Structured prompt versions with full change history
 *
 * Version format: MAJOR.MINOR
 * - MAJOR: Breaking changes to output structure
 * - MINOR: Improvements to prompt quality
 */
export const PROMPT_VERSION_INFO: Record<PromptType, PromptVersionInfo> = {
  'diff-summary': {
    current: '1.1',
    history: [
      {
        version: '1.1',
        date: '2026-01-05',
        description:
          'Improved description quality: require numbers and specific keywords from headlines',
      },
      {
        version: '1.0',
        date: '2026-01-04',
        description: 'Initial version with change detection and categorization',
      },
    ],
  },
  'viewpoint-map': {
    current: '1.0',
    history: [
      {
        version: '1.0',
        date: '2026-01-04',
        description:
          'Initial version with issue extraction and stance analysis',
      },
    ],
  },
  'code-tips': {
    current: '1.0',
    history: [
      {
        version: '1.0',
        date: '2026-01-04',
        description:
          'Initial version with code block extraction and quality scoring',
      },
    ],
  },
};

/**
 * Current prompt versions (for backward compatibility)
 */
export const PROMPT_VERSIONS: Record<PromptType, string> = Object.fromEntries(
  Object.entries(PROMPT_VERSION_INFO).map(([key, info]) => [key, info.current])
) as Record<PromptType, string>;

/**
 * Get the current version for a prompt type
 */
export function getPromptVersion(type: PromptType): string {
  return PROMPT_VERSION_INFO[type].current;
}

/**
 * Get the full version history for a prompt type
 */
export function getPromptVersionHistory(
  type: PromptType
): VersionHistoryEntry[] {
  return PROMPT_VERSION_INFO[type].history;
}
