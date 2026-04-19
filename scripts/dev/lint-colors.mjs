#!/usr/bin/env node
/**
 * lint-colors: TechTrend design token migration guard.
 *
 * Detects hardcoded Tailwind color utility classes (e.g. `bg-slate-100`,
 * `text-red-500`, `from-sky-50`) in .ts / .tsx sources under app/, components/
 * and lib/, and fails CI when violations remain outside of the allowlist.
 *
 * Improvements over the previous grep-based implementation:
 *   - Full 22-family color coverage (includes sky/cyan/rose/lime/zinc/…)
 *   - Extended prefix coverage: bg/text/border(-{l,r,t,b})/from/to/via/ring/
 *     fill/stroke/outline
 *   - Skips line-comments (//) and block-comments (slash-star … star-slash),
 *     avoiding false positives on the color names that appear in prose.
 *   - `.lintcolorsignore` allowlist with hard-required provenance comments
 *     (`# TODO: remove after PR-N …` or `# brand-only: …`).
 *   - Rejects dangerously broad allowlist patterns (e.g. `app/**`).
 *   - Optional `--self-check` mode runs regression fixtures.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components', 'lib'];
const EXTS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.workflow',
  '.git',
]);

const COLOR_FAMILIES = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

const COLOR_PREFIXES = [
  'bg',
  'text',
  'border',
  'border-l',
  'border-r',
  'border-t',
  'border-b',
  'from',
  'to',
  'via',
  'ring',
  'fill',
  'stroke',
  'outline',
  'decoration',
  'divide',
  'accent',
  'caret',
  'placeholder',
  'shadow',
];

// Word boundary on the left prevents matches inside longer identifiers (e.g. `hover:text-red-500`
// is still matched because `:` is a non-word character). The right-hand side requires a numeric
// shade.
const COLOR_REGEX = new RegExp(
  `\\b(?:${COLOR_PREFIXES.join('|')})-(?:${COLOR_FAMILIES.join('|')})-\\d+`,
  'g',
);

const ALLOWLIST_PATH = path.join(ROOT, '.lintcolorsignore');
// Reject patterns that would gag the detector across entire top-level areas.
// Includes both `app/**` globs AND `app/` directory-recursive forms; the latter
// would otherwise silence everything under the scan roots (CX-W2 / DA-W2 fix).
const DANGEROUS_ALLOWLIST_PATTERNS = [
  'app/**',
  'components/**',
  'lib/**',
  'app/',
  'components/',
  'lib/',
  '**/*',
  '**',
  '*',
];

// Reject any directory allowlist that only has a single top-level segment
// (e.g. `foo/` would silence all of foo). Sub-directory allowlists like
// `app/dashboard/legacy/` remain valid.
function isTooShallowDirectoryPattern(pattern) {
  if (!pattern.endsWith('/')) return false;
  const segments = pattern.replace(/\/$/, '').split('/').filter(Boolean);
  return segments.length < 2;
}

// Reject globstar `**` patterns. matchPattern() does not support cross-segment
// matching and a pattern like `app/**/*.tsx` would slip past the shallow /
// dangerous checks while still silencing large swathes of the tree. Force
// exact file paths or narrow trailing-slash directories instead.
function isUnsupportedGlobPattern(pattern) {
  return pattern.includes('**');
}

const ALLOWLIST_COMMENT_REGEX =
  /#\s*(TODO:\s*remove\s+after\s+PR-\d+\b|brand-only\b|permanent\b)/i;

async function readIgnoreFile() {
  let raw;
  try {
    raw = await fs.readFile(ALLOWLIST_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { entries: [], errors: [] };
    throw err;
  }

  const entries = [];
  const errors = [];
  const lines = raw.split('\n');
  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const hashIndex = indexOfUnquotedHash(line);
    const pattern = (hashIndex === -1 ? line : line.slice(0, hashIndex)).trim();
    const comment = hashIndex === -1 ? '' : line.slice(hashIndex).trim();

    if (!pattern) return;

    for (const dangerous of DANGEROUS_ALLOWLIST_PATTERNS) {
      if (pattern === dangerous) {
        errors.push(
          `.lintcolorsignore:${lineNumber}: pattern "${pattern}" is too broad. Narrow it to specific files or directories.`,
        );
        return;
      }
    }

    if (isUnsupportedGlobPattern(pattern)) {
      errors.push(
        `.lintcolorsignore:${lineNumber}: pattern "${pattern}" uses unsupported multi-segment glob "**". Use explicit file paths or a narrow trailing-slash directory.`,
      );
      return;
    }

    if (isTooShallowDirectoryPattern(pattern)) {
      errors.push(
        `.lintcolorsignore:${lineNumber}: directory pattern "${pattern}" is too shallow (single top-level segment). Add at least one sub-directory (e.g. "app/dashboard/legacy/").`,
      );
      return;
    }

    if (!ALLOWLIST_COMMENT_REGEX.test(comment)) {
      errors.push(
        `.lintcolorsignore:${lineNumber}: entry "${pattern}" must include a "# TODO: remove after PR-N …" or "# brand-only: …" or "# permanent: …" comment.`,
      );
      return;
    }

    entries.push({ pattern, lineNumber, comment });
  });

  return { entries, errors };
}

// Find the first `#` that is not inside single or double quotes.
// This lets patterns contain `#` (unusual) while still allowing trailing comments.
function indexOfUnquotedHash(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (!inDouble && ch === "'") inSingle = !inSingle;
    else if (!inSingle && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '#') return i;
  }
  return -1;
}

function isIgnored(relPath, patterns) {
  const normalised = relPath.split(path.sep).join('/');
  for (const { pattern } of patterns) {
    if (matchPattern(normalised, pattern)) return true;
  }
  return false;
}

// Minimal glob: supports exact paths, trailing `/` for directories (and all contents),
// and a single `*` wildcard per segment. Multi-segment globs (`**`) are intentionally
// unsupported to keep the allowlist targeted.
function matchPattern(filePath, pattern) {
  if (pattern.endsWith('/')) {
    return filePath.startsWith(pattern);
  }
  if (pattern.includes('*')) {
    const regex = new RegExp(
      '^' +
        pattern
          .split('*')
          .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*') +
        '$',
    );
    return regex.test(filePath);
  }
  return filePath === pattern;
}

async function walk(dir) {
  const abs = path.join(ROOT, dir);
  const out = [];
  try {
    await fs.access(abs);
  } catch {
    return out;
  }
  async function visit(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await visit(path.join(current, entry.name));
      } else if (entry.isFile() && EXTS.has(path.extname(entry.name))) {
        out.push(path.relative(ROOT, path.join(current, entry.name)));
      }
    }
  }
  await visit(abs);
  return out;
}

// Strip comments to avoid false positives on color names that appear in prose.
// Tracks string/template/regex literal contexts so that tokens inside them are
// not misinterpreted as comment delimiters. This is not a full JS parser, but it
// handles the common cases that bite the color-family regex: `/…/` regex literals
// starting with a forward slash and JSX/TS strings containing `//` URL fragments.
function stripComments(source) {
  const out = [];
  let inBlock = false;
  let inLine = false;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inRegex = false;
  let regexCharClass = false;

  const PRECEDES_REGEX = new Set([
    '(',
    ',',
    '=',
    ':',
    '[',
    '!',
    '&',
    '|',
    '?',
    '{',
    '}',
    ';',
    '\n',
    '\r',
    '+',
    '-',
    '*',
    '~',
    '<',
    '>',
    '%',
    '^',
  ]);

  // Keywords that, when they appear immediately before a `/`, force regex
  // literal semantics (division is illegal right after these). Without this the
  // single-char lookback treats `return /https?:\/\//` as division and lets the
  // trailing `//` swallow the rest of the line as a comment.
  const PRECEDES_REGEX_KEYWORDS = new Set([
    'return',
    'throw',
    'case',
    'delete',
    'void',
    'typeof',
    'yield',
    'await',
    'new',
    'in',
    'of',
    'instanceof',
    'do',
    'else',
    'finally',
  ]);

  function previousSignificantToken(index) {
    let prevIdx = index - 1;
    while (prevIdx >= 0 && /\s/.test(source[prevIdx])) prevIdx--;
    if (prevIdx < 0) return undefined;

    const ch = source[prevIdx];
    if (!/[A-Za-z0-9_$]/.test(ch)) return ch;

    const endExclusive = prevIdx + 1;
    while (prevIdx >= 0 && /[A-Za-z0-9_$]/.test(source[prevIdx])) prevIdx--;
    return source.slice(prevIdx + 1, endExclusive);
  }

  function canStartRegexAfterToken(prevToken) {
    if (prevToken === undefined) return true;
    if (prevToken.length === 1) return PRECEDES_REGEX.has(prevToken);
    return PRECEDES_REGEX_KEYWORDS.has(prevToken);
  }

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        out.push('  ');
        i++;
      } else {
        out.push(ch === '\n' ? '\n' : ' ');
      }
      continue;
    }
    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out.push('\n');
      } else {
        out.push(' ');
      }
      continue;
    }
    if (inRegex) {
      out.push(ch);
      if (ch === '\\' && next !== undefined) {
        out.push(next);
        i++;
        continue;
      }
      if (ch === '[') regexCharClass = true;
      else if (ch === ']') regexCharClass = false;
      else if (ch === '/' && !regexCharClass) {
        inRegex = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === '/' && next === '*') {
        inBlock = true;
        out.push('  ');
        i++;
        continue;
      }
      if (ch === '/' && next === '/') {
        inLine = true;
        out.push('  ');
        i++;
        continue;
      }
      if (ch === '/') {
        // Heuristic: is this the start of a regex literal? Look at the previous
        // significant token (single punctuation char OR identifier word).
        // Division (`a / b`) only occurs after values; regex literals follow
        // punctuation operators or keywords like `return`, `throw`, `await`.
        const prevToken = previousSignificantToken(i);
        if (canStartRegexAfterToken(prevToken)) {
          inRegex = true;
          out.push(ch);
          continue;
        }
      }
    }

    if (!inDouble && !inTemplate && ch === "'" && source[i - 1] !== '\\') inSingle = !inSingle;
    else if (!inSingle && !inTemplate && ch === '"' && source[i - 1] !== '\\') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`' && source[i - 1] !== '\\') inTemplate = !inTemplate;

    out.push(ch);
  }
  return out.join('');
}

async function scanFile(relPath) {
  const abs = path.join(ROOT, relPath);
  const source = await fs.readFile(abs, 'utf8');
  const stripped = stripComments(source);
  const hits = [];
  const lines = stripped.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineMatches = line.match(COLOR_REGEX);
    if (!lineMatches) continue;
    for (const match of lineMatches) {
      hits.push({ file: relPath, line: i + 1, match });
    }
  }
  return hits;
}

async function runSelfCheck() {
  const cases = [
    {
      name: 'detect bg-sky-500',
      source: 'const a = <div className="bg-sky-500" />;',
      expectMatch: true,
    },
    {
      name: 'detect from-rose-50 gradient',
      source: 'const a = <div className="from-rose-50 to-pink-50" />;',
      expectMatch: true,
    },
    {
      name: 'detect border-l-red-500',
      source: 'const a = <div className="border-l-red-500" />;',
      expectMatch: true,
    },
    {
      name: 'detect fill-cyan-400',
      source: 'const a = <svg className="fill-cyan-400" />;',
      expectMatch: true,
    },
    {
      name: 'ignore comment: // bg-gray-50',
      source: '// bg-gray-50 only in comment\nconst a = 1;',
      expectMatch: false,
    },
    {
      name: 'ignore block comment: /* text-red-600 */',
      source: '/* text-red-600 in block */\nconst a = 1;',
      expectMatch: false,
    },
    {
      name: 'ignore CSS variable reference',
      source: 'const a = <div className="bg-[var(--tt-color-primary)]" />;',
      expectMatch: false,
    },
    {
      name: 'ignore token shorthand',
      source: 'const a = <div className="bg-(--tt-color-primary)/10" />;',
      expectMatch: false,
    },
    {
      name: 'do not misread // in regex literal as a line comment (CX-W1)',
      source:
        'const re = /https?:\\/\\//; const el = <div className="bg-red-500" />;',
      expectMatch: true,
    },
    {
      name: 'do not misread // inside a string literal',
      source: 'const url = "https://example.com"; const el = <div className="text-rose-600" />;',
      expectMatch: true,
    },
    {
      name: 'do not misread // in regex after return keyword (CodeRabbit T3)',
      source:
        'function hasUrl(v) { return /https?:\\/\\//.test(v); } const el = <div className="bg-red-500" />;',
      expectMatch: true,
    },
    {
      name: 'do not misread // in regex after throw keyword',
      source:
        'throw /invalid:\\/\\//; const el = <div className="text-rose-700" />;',
      expectMatch: true,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const stripped = stripComments(c.source);
    const hit = COLOR_REGEX.test(stripped);
    COLOR_REGEX.lastIndex = 0;
    if (hit !== c.expectMatch) {
      failed++;
      console.error(`✗ ${c.name}: expected match=${c.expectMatch}, got match=${hit}`);
    } else {
      console.log(`✓ ${c.name}`);
    }
  }

  const allowlistCases = [
    {
      name: 'accept directory entry with TODO comment',
      pattern: 'lib/utils/source/source-colors.ts',
      comment: '# TODO: remove after PR-2 棚卸し',
      expectOk: true,
    },
    {
      name: 'accept brand-only marker',
      pattern: 'lib/utils/source/source-colors.ts',
      comment: '# brand-only: source identity colors',
      expectOk: true,
    },
    {
      name: 'reject entry without comment',
      pattern: 'lib/constants/tag-categories.ts',
      comment: '',
      expectOk: false,
    },
    {
      name: 'reject broad pattern app/**',
      pattern: 'app/**',
      comment: '# brand-only: test',
      expectOk: false,
    },
    {
      name: 'reject shallow directory allowlist app/ (CX-W2/DA-W2)',
      pattern: 'app/',
      comment: '# brand-only: test',
      expectOk: false,
    },
    {
      name: 'reject shallow directory allowlist components/',
      pattern: 'components/',
      comment: '# brand-only: test',
      expectOk: false,
    },
    {
      name: 'accept nested directory allowlist app/dashboard/legacy/',
      pattern: 'app/dashboard/legacy/',
      comment: '# TODO: remove after PR-2',
      expectOk: true,
    },
    {
      name: 'reject globstar pattern app/**/*.tsx (CodeRabbit T2)',
      pattern: 'app/**/*.tsx',
      comment: '# brand-only: test',
      expectOk: false,
    },
    {
      name: 'reject globstar pattern components/**',
      pattern: 'components/**',
      comment: '# brand-only: test',
      expectOk: false,
    },
  ];

  for (const c of allowlistCases) {
    const line = c.comment ? `${c.pattern} ${c.comment}` : c.pattern;
    const hashIndex = indexOfUnquotedHash(line);
    const pattern = (hashIndex === -1 ? line : line.slice(0, hashIndex)).trim();
    const comment = hashIndex === -1 ? '' : line.slice(hashIndex).trim();
    const isDangerous = DANGEROUS_ALLOWLIST_PATTERNS.some((p) => pattern === p);
    const isShallow = isTooShallowDirectoryPattern(pattern);
    const isGlobstar = isUnsupportedGlobPattern(pattern);
    const hasComment = ALLOWLIST_COMMENT_REGEX.test(comment);
    const ok = !isDangerous && !isShallow && !isGlobstar && hasComment;
    if (ok !== c.expectOk) {
      failed++;
      console.error(`✗ ${c.name}: expected ok=${c.expectOk}, got ok=${ok}`);
    } else {
      console.log(`✓ ${c.name}`);
    }
  }

  // Validate the real `.lintcolorsignore` file in the repository root so that
  // self-check protects the shipped config, not only fixtures (CodeRabbit T4).
  const { errors: realFileErrors } = await readIgnoreFile();
  if (realFileErrors.length > 0) {
    failed += realFileErrors.length;
    console.error('\n✗ real .lintcolorsignore validation failed:');
    for (const err of realFileErrors) console.error(`  ${err}`);
  } else {
    console.log('✓ real .lintcolorsignore entries pass validation');
  }

  if (failed > 0) {
    console.error(`\n${failed} self-check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll self-checks passed.');
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) {
    await runSelfCheck();
    return;
  }

  const verbose = args.includes('--verbose');

  const { entries: allowlist, errors: allowlistErrors } = await readIgnoreFile();
  if (allowlistErrors.length > 0) {
    console.error('Invalid .lintcolorsignore entries:');
    for (const err of allowlistErrors) console.error(`  ${err}`);
    process.exit(2);
  }

  const files = [];
  for (const dir of SCAN_DIRS) {
    files.push(...(await walk(dir)));
  }

  const allHits = [];
  for (const rel of files) {
    if (isIgnored(rel, allowlist)) continue;
    const hits = await scanFile(rel);
    if (hits.length) allHits.push(...hits);
  }

  if (allHits.length === 0) {
    console.log(
      `lint:colors: no hardcoded Tailwind colors found (${files.length} files scanned, ${allowlist.length} ignored).`,
    );
    process.exit(0);
  }

  const byFile = new Map();
  for (const hit of allHits) {
    const arr = byFile.get(hit.file) ?? [];
    arr.push(hit);
    byFile.set(hit.file, arr);
  }

  const sortedFiles = [...byFile.keys()].sort();
  for (const file of sortedFiles) {
    const hits = byFile.get(file);
    for (const hit of hits) {
      console.log(`${hit.file}:${hit.line}:${hit.match}`);
    }
    if (verbose) {
      console.log(`  -> ${hits.length} hit(s) in ${file}`);
    }
  }

  console.error(
    `\nlint:colors: ${allHits.length} hardcoded color occurrence(s) in ${byFile.size} file(s).`,
  );
  console.error(
    'Replace with design tokens (e.g. bg-[var(--tt-color-surface)]) or add an allowlist entry with a "# TODO: remove after PR-N …" / "# brand-only: …" comment.',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
