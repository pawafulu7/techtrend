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
        className="bg-card text-card-foreground border-foreground/10 rounded-[var(--tt-radius-xl)] border p-[var(--tt-space-5)] shadow-[var(--tt-shadow-card-rest)]"
        data-testid="detailed-summary-fallback"
      >
        <p className="mb-[var(--tt-space-3)] font-[family-name:var(--tt-font-heading)] font-semibold tracking-[var(--tt-tracking-tight)] text-[var(--tt-text-sm)]">
          詳細要約
        </p>
        <div className="text-card-foreground/80 font-[family-name:var(--tt-font-body)] leading-[var(--tt-leading-relaxed)] whitespace-pre-wrap text-[var(--tt-text-sm)]">
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
      <h3 className="mb-[var(--tt-space-4)] font-[family-name:var(--tt-font-heading)] font-semibold tracking-[var(--tt-tracking-tight)] text-[var(--tt-text-sm)]">
        詳細要約
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section, index) => {
          const isEven = index % 2 === 0;
          const accentColor = isEven
            ? 'var(--tt-color-primary)'
            : 'var(--tt-color-secondary)';

          return (
            <article
              key={index}
              className="group min-h-[44px] space-y-2 rounded-lg border border-[var(--tt-color-border)] bg-[var(--tt-color-surface)] p-4 shadow-sm transition-all duration-200 hover:border-[var(--tt-color-border-hover)] hover:shadow-md motion-safe:animate-[fadeInUp_0.4s_ease_forwards] motion-safe:opacity-0"
              style={{
                borderLeftWidth: '3px',
                borderLeftColor: accentColor,
                animationDelay: `${index * 60}ms`,
              }}
              data-testid={`detailed-summary-section-${index}`}
            >
              <h4 className="flex items-center gap-2 font-[family-name:var(--tt-font-heading)] text-sm font-semibold tracking-[var(--tt-tracking-tight)]">
                <span
                  className="bg-muted/60 group-hover:bg-muted flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-lg transition-colors duration-200"
                  aria-hidden="true"
                >
                  {section.icon}
                </span>
                <span className="line-clamp-1 flex-1" title={section.title}>
                  {section.title}
                </span>
              </h4>

              <div className="space-y-1 font-[family-name:var(--tt-font-body)] text-sm leading-relaxed text-[var(--tt-color-text)]">
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
