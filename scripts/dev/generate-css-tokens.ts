/**
 * Generate CSS Custom Properties from Design Tokens
 *
 * This script reads lib/design-tokens.ts and generates app/generated-tokens.css
 * to ensure a single source of truth and prevent token drift.
 *
 * Usage: npm run generate:tokens
 */

import { promises as fs } from 'fs';
import path from 'path';
import { designTokens } from '../../lib/design-tokens';

const outPath = path.join(process.cwd(), 'app/generated-tokens.css');

/**
 * Convert camelCase to kebab-case
 */
function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

/**
 * Convert a flat object to CSS custom properties
 */
function toVars(
  obj: Record<string, string | number>,
  prefix: string,
  numericSort = false
): string {
  const entries = Object.entries(obj);

  const sorted = numericSort
    ? entries.sort(([a], [b]) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        return isNaN(numA) || isNaN(numB) ? a.localeCompare(b) : numA - numB;
      })
    : entries.sort(([a], [b]) => a.localeCompare(b));

  return sorted
    .map(([k, v]) => {
      const kebabKey = toKebabCase(k);
      return `  --tt-${prefix}-${kebabKey}: ${v};`;
    })
    .join('\n');
}

/**
 * Convert a two-level nested color object (e.g. categoryColors.light) to CSS
 * custom properties. Emits `--tt-{prefix}-{outer}-{inner-kebab}: value;` lines.
 * Used for structured tokens that group related variants under a parent key
 * (category.bg, category.bgHover, category.icon, category.iconHover, ...).
 */
function toNestedColorVars(
  obj: Record<string, Record<string, string>>,
  prefix: string,
): string {
  const lines: string[] = [];
  for (const [outerKey, inner] of Object.entries(obj).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const [innerKey, value] of Object.entries(inner).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const kebabInner = toKebabCase(innerKey);
      lines.push(`  --tt-${prefix}-${outerKey}-${kebabInner}: ${value};`);
    }
  }
  return lines.join('\n');
}

/**
 * Convert nested typography object to CSS custom properties
 */
function toTypographyVars(): string {
  const lines: string[] = [];

  // Font families
  lines.push(toVars(designTokens.typography.family, 'font'));

  // Font sizes
  lines.push(toVars(designTokens.typography.size, 'text'));

  // Font weights
  lines.push(toVars(designTokens.typography.weight, 'font-weight'));

  // Line heights
  lines.push(toVars(designTokens.typography.lineHeight, 'leading'));

  // Letter spacing
  lines.push(toVars(designTokens.typography.letterSpacing, 'tracking'));

  return lines.join('\n');
}

/**
 * Build the complete CSS content
 */
function buildCSS(): string {
  const lines = [
    '/**',
    ' * Auto-generated from lib/design-tokens.ts',
    ' * DO NOT EDIT BY HAND - Run `npm run generate:tokens` instead',
    ' */',
    '',
    ':root {',
    '  /* Colors - Light Mode */',
    toVars(designTokens.colors.light, 'color'),
    '',
    '  /* Category Colors - Light Mode (AI search category tiles) */',
    toNestedColorVars(designTokens.categoryColors.light, 'color-category'),
    '',
    '  /* Status Colors - Light Mode (social-posts, diff-summary, metrics status UI) */',
    toNestedColorVars(designTokens.statusColors.light, 'color-status'),
    '',
    '  /* Typography */',
    toTypographyVars(),
    '',
    '  /* Shadows */',
    toVars(designTokens.shadows, 'shadow'),
    '',
    '  /* Spacing */',
    toVars(designTokens.spacing, 'space', true),
    '',
    '  /* Border Radius */',
    toVars(designTokens.radius, 'radius'),
    '}',
    '',
    '.dark {',
    '  /* Colors - Dark Mode */',
    toVars(designTokens.colors.dark, 'color'),
    '',
    '  /* Category Colors - Dark Mode */',
    toNestedColorVars(designTokens.categoryColors.dark, 'color-category'),
    '',
    '  /* Status Colors - Dark Mode */',
    toNestedColorVars(designTokens.statusColors.dark, 'color-status'),
    '}',
    '',
  ];

  return lines.join('\n');
}

/**
 * Main function
 */
async function main() {
  try {
    const css = buildCSS();
    await fs.writeFile(outPath, css, 'utf8');
    console.log(`Successfully generated CSS tokens: ${outPath}`);
    console.log(`Total lines: ${css.split('\n').length}`);
  } catch (error) {
    console.error('Failed to generate CSS tokens:', error);
    process.exit(1);
  }
}

main();
