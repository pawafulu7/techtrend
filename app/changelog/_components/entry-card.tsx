'use client';

interface EntryCardProps {
  content: string;
  titleJa?: string | null;
  contentJa?: string | null;
}

export function EntryCard({ content, titleJa, contentJa }: EntryCardProps) {
  const title = titleJa || content;
  const description = contentJa || content;
  const showDescription = Boolean(contentJa && description !== title);

  return (
    <div className="rounded-lg border border-[var(--tt-color-border)] bg-[var(--tt-color-surface)] px-4 py-3.5">
      <p className="text-sm leading-snug font-semibold text-[var(--tt-color-text)]">
        {title}
      </p>
      {showDescription && (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--tt-color-text)]">
          {description}
        </p>
      )}
    </div>
  );
}
