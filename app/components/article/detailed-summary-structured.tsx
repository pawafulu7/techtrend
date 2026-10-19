import { parseSummary } from '@/lib/utils/summary/summary-parser';
import { ArticleType } from '@/lib/utils/article/article-type-detector';

interface DetailedSummaryStructuredProps {
  detailedSummary: string;
  articleType?: ArticleType;
  summaryVersion?: number | string | null;
}

export function DetailedSummaryStructured({
  detailedSummary,
  articleType,
  summaryVersion,
}: DetailedSummaryStructuredProps) {
  const parsedSummaryVersion =
    typeof summaryVersion === 'number'
      ? summaryVersion
      : typeof summaryVersion === 'string'
        ? Number.parseInt(summaryVersion, 10)
        : undefined;
  const normalizedSummaryVersion =
    typeof parsedSummaryVersion === 'number' &&
    Number.isFinite(parsedSummaryVersion)
      ? parsedSummaryVersion
      : undefined;

  const sections = parseSummary(detailedSummary, {
    articleType,
    summaryVersion: normalizedSummaryVersion,
  });

  // Fallback for parse failure
  if (sections.length === 0) {
    return (
      <div
        className="bg-card text-card-foreground border-foreground/10 rounded-xl border p-[var(--tt-space-5)]"
        data-testid="detailed-summary-fallback"
      >
        <h3 className="text-h3 mb-[var(--tt-space-3)] tracking-[var(--tt-tracking-tight)]">
          詳細要約
        </h3>
        <div className="text-card-foreground/80 text-summary whitespace-pre-wrap">
          {detailedSummary}
        </div>
      </div>
    );
  }

  return (
    <section
      className="text-foreground rounded-xl bg-[var(--tt-color-surface-muted)] p-4"
      aria-label="詳細要約"
      data-testid="detailed-summary-container"
    >
      <h3 className="text-h3 mb-[var(--tt-space-4)] tracking-[var(--tt-tracking-tight)]">
        詳細要約
      </h3>
      {/* 段は影と浮き上がりの動きを付けず、線で区切る */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section, index) => {
          return (
            <article
              key={index}
              className="space-y-2 rounded-lg border border-l-[3px] border-[var(--tt-color-border)] border-l-[var(--tt-color-primary)] bg-[var(--tt-color-surface)] p-4"
              data-testid={`detailed-summary-section-${index}`}
            >
              <h4 className="font-heading flex items-center gap-2 text-sm font-semibold tracking-[var(--tt-tracking-tight)]">
                <span
                  className="bg-muted/60 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-lg"
                  aria-hidden="true"
                >
                  {section.icon}
                </span>
                <span className="line-clamp-1 flex-1" title={section.title}>
                  {section.title}
                </span>
              </h4>

              <div className="text-summary space-y-1 text-[var(--tt-color-text)]">
                {section.content.split('\n').map((line, lineIndex) => (
                  <p key={lineIndex}>{highlightContent(line)}</p>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Highlight important parts of the content
function highlightContent(content: string): React.ReactNode {
  // Important keyword patterns with text decoration for WCAG 1.4.1 compliance
  const patterns = [
    {
      regex: /問題は(.+?)である/g,
      style:
        'font-semibold text-destructive underline decoration-wavy decoration-1',
    },
    {
      regex: /解決策は(.+?)である/g,
      style: 'font-semibold text-primary underline decoration-2',
    },
    {
      regex: /効果は(.+?)である/g,
      style:
        'font-semibold text-[var(--tt-color-positive)] underline decoration-dotted decoration-1',
    },
    {
      regex: /注意点は(.+?)である/g,
      style:
        'font-semibold text-[var(--tt-color-warning)] underline decoration-dashed decoration-1',
    },
  ];

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const matches: { start: number; end: number; text: string; style: string }[] =
    [];

  // Collect all matches
  patterns.forEach(({ regex, style }) => {
    const regexCopy = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = regexCopy.exec(content)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        style,
      });
    }
  });

  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start);

  // Split text and highlight
  matches.forEach((match, index) => {
    // Skip overlapping matches
    if (match.start < lastIndex) {
      return;
    }

    // Text before match
    if (match.start > lastIndex) {
      parts.push(content.substring(lastIndex, match.start));
    }

    // Highlighted text
    parts.push(
      <span key={index} className={match.style}>
        {match.text}
      </span>
    );

    lastIndex = match.end;
  });

  // Last part
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}
