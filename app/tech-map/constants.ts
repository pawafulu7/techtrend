/**
 * Shared constants for the tech-map feature.
 */

/** All entity type values */
export const ALL_ENTITY_TYPES = [
  'LANGUAGE',
  'FRAMEWORK',
  'TOOL',
  'CONCEPT',
  'PLATFORM',
  'LIBRARY',
] as const;

export type EntityTypeKey = (typeof ALL_ENTITY_TYPES)[number];

/**
 * Entity type color mappings for bg (background) and text classes.
 * Used across Legend, SidePanel, Controls, and Graph components.
 */
export const ENTITY_TYPE_COLORS: Record<
  EntityTypeKey,
  { bg: string; text: string; label: string }
> = {
  LANGUAGE: { bg: 'bg-blue-500', text: 'text-blue-400', label: 'Language' },
  FRAMEWORK: {
    bg: 'bg-purple-500',
    text: 'text-purple-400',
    label: 'Framework',
  },
  TOOL: { bg: 'bg-green-500', text: 'text-green-400', label: 'Tool' },
  CONCEPT: { bg: 'bg-amber-500', text: 'text-amber-400', label: 'Concept' },
  PLATFORM: { bg: 'bg-red-500', text: 'text-red-400', label: 'Platform' },
  LIBRARY: { bg: 'bg-teal-500', text: 'text-teal-400', label: 'Library' },
};

/**
 * Get the bg color class for a given entity type.
 */
export function getEntityTypeBgColor(type: string): string {
  return ENTITY_TYPE_COLORS[type]?.bg ?? 'bg-slate-500';
}

/**
 * Get the text color class for a given entity type.
 */
export function getEntityTypeTextColor(type: string): string {
  return ENTITY_TYPE_COLORS[type]?.text ?? 'text-slate-400';
}
