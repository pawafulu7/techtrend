// ---------------------------------------------------------------------------
// CHANGELOG.md parser
// Parses markdown content structured as:
//   ## X.Y.Z
//   - Entry text ...
// ---------------------------------------------------------------------------

export type ChangelogCategory = 'FEATURE' | 'BUGFIX' | 'IMPROVEMENT' | 'OTHER';

export interface ParsedEntry {
  content: string;
  category: ChangelogCategory;
  orderIndex: number;
}

export interface ParsedVersion {
  version: string;
  sortOrder: number;
  entries: ParsedEntry[];
}

export interface ParsedChangelog {
  versions: ParsedVersion[];
}

// ---------------------------------------------------------------------------
// Classification rules
// ---------------------------------------------------------------------------

interface ClassificationRule {
  category: ChangelogCategory;
  pattern: RegExp;
}

export const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  {
    category: 'FEATURE',
    pattern:
      /^(Add(ed|s)?|Introduc(ed|es)?|Releas(ed|es)?|New|Support(ed|s)?|Allow(ed|s)?)\b/i,
  },
  {
    category: 'BUGFIX',
    pattern: /^(Fix(ed|es)?|Resolv(ed|es)?|Revert(ed|s)?)\b/i,
  },
  {
    category: 'IMPROVEMENT',
    pattern:
      /^(Improv(ed|es)?|Enhanc(ed|es)?|Optimiz(ed|es)?|Updat(ed|es)?|Upgrad(ed|es)?|Increas(ed|es)?|Reduc(ed|es)?|Expand(ed|s)?|Deprecat(ed|es)?|Chang(ed|es)?|Remov(ed|es)?|Set|Use)\b/i,
  },
] as const;

// ---------------------------------------------------------------------------
// classifyEntry
// ---------------------------------------------------------------------------

export function classifyEntry(content: string): ChangelogCategory {
  const trimmed = content.trim();
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(trimmed)) {
      return rule.category;
    }
  }
  return 'OTHER';
}

// ---------------------------------------------------------------------------
// versionToSortOrder
// ---------------------------------------------------------------------------

export function versionToSortOrder(version: string): number {
  // ビルドメタデータを除去
  const withoutBuild = version.replace(/\+.*$/, '');
  // プレリリースサフィックスを除去して数値部分のみ使用
  const numericPart = withoutBuild.replace(/-.*$/, '');
  const parts = numericPart.split('.');
  const major = parseInt(parts[0] ?? '0', 10) || 0;
  const minor = parseInt(parts[1] ?? '0', 10) || 0;
  const patch = parseInt(parts[2] ?? '0', 10) || 0;
  // プレリリースは同一数値版より前に並ぶようにする
  const isPreRelease = withoutBuild.includes('-') ? 0 : 1;
  return major * 1_000_000_000 + minor * 1_000_000 + patch * 10 + isPreRelease;
}

// ---------------------------------------------------------------------------
// parseChangelog
// ---------------------------------------------------------------------------

const VERSION_HEADER_RE =
  /^##\s+v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/;
const ENTRY_RE = /^[*-]\s+(.+)/;

export function parseChangelog(markdown: string): ParsedChangelog {
  const lines = markdown.split('\n');
  const versions: ParsedVersion[] = [];
  let current: ParsedVersion | null = null;

  for (const line of lines) {
    const versionMatch = line.match(VERSION_HEADER_RE);
    if (versionMatch) {
      current = {
        version: versionMatch[1],
        sortOrder: versionToSortOrder(versionMatch[1]),
        entries: [],
      };
      versions.push(current);
      continue;
    }

    if (current) {
      const entryMatch = line.match(ENTRY_RE);
      if (entryMatch) {
        const content = entryMatch[1];
        current.entries.push({
          content,
          category: classifyEntry(content),
          orderIndex: current.entries.length,
        });
      }
    }
  }

  return { versions };
}
