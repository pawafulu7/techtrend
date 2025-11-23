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
import { designTokens } from '../lib/design-tokens';

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
  prefix: string
): string {
  return Object.entries(obj)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      const kebabKey = toKebabCase(k);
      return `  --tt-${prefix}-${kebabKey}: ${v};`;
    })
    .join('\n');
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
    '  /* Typography */',
    toTypographyVars(),
    '',
    '  /* Shadows */',
    toVars(designTokens.shadows, 'shadow'),
    '',
    '  /* Spacing */',
    toVars(designTokens.spacing, 'space'),
    '',
    '  /* Border Radius */',
    toVars(designTokens.radius, 'radius'),
    '}',
    '',
    '.dark {',
    '  /* Colors - Dark Mode */',
    toVars(designTokens.colors.dark, 'color'),
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
