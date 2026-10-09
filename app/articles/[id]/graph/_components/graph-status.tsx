/** 読み込み中・失敗時も h1 を1つ置く（Issue #700） */
function GraphHeading() {
  return (
    <h1 className="font-heading text-foreground text-h1 mb-4">
      関連記事グラフ
    </h1>
  );
}

export function GraphSkeleton({
  withHeading = true,
}: {
  withHeading?: boolean;
}) {
  return (
    <div className="dark flex h-screen w-full items-center justify-center bg-[var(--tt-color-surface)] scheme-dark">
      <div className="text-center">
        {withHeading && <GraphHeading />}
        <div className="border-tt-text mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2"></div>
        <p className="text-tt-text">Loading relationship graph...</p>
      </div>
    </div>
  );
}

export function GraphError({ error }: { error: Error }) {
  console.error('[GraphError]', error);

  return (
    <div className="dark flex h-screen w-full items-center justify-center bg-[var(--tt-color-surface)] scheme-dark">
      <div className="text-center">
        <GraphHeading />
        <p className="mb-2 text-lg text-[var(--tt-color-negative)]">
          Failed to load graph
        </p>
        {process.env.NODE_ENV === 'development' && (
          <p
            className="text-sm text-[var(--tt-color-text-muted)]"
            data-testid="graph-error-message"
          >
            {error.message}
          </p>
        )}
      </div>
    </div>
  );
}
