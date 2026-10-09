/**
 * Generate CSS Custom Properties from Design Tokens
 *
 * This script reads lib/design-tokens/ and generates app/generated-tokens.css
 * to ensure a single source of truth and prevent token drift.
 * The CSS itself is built in lib/utils/design-tokens/build-css.ts.
 *
 * Usage: npm run generate:tokens
 */

import { promises as fs } from 'fs';
import path from 'path';
import { buildTokensCss } from '../../lib/utils/design-tokens/build-css';

const outPath = path.join(process.cwd(), 'app/generated-tokens.css');

/**
 * Main function
 */
async function main() {
  try {
    const css = buildTokensCss();
    await fs.writeFile(outPath, css, 'utf8');
    console.log(`Successfully generated CSS tokens: ${outPath}`);
    console.log(`Total lines: ${css.split('\n').length}`);
  } catch (error) {
    console.error('Failed to generate CSS tokens:', error);
    process.exit(1);
  }
}

main();
