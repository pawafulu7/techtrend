import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function ArticleDetailLoading() {
  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
      <div className="w-full px-6 py-6">
        {/* Back button */}
        <div className="mb-2">
          <Skeleton className="h-[44px] w-36" />
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Main content */}
          <div className="flex-1 space-y-6">
            <Card className="gap-4 bg-[var(--tt-color-surface-muted)]">
              <CardHeader>
                <div className="space-y-4">
                  {/* Badges row */}
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-4 w-32" />
                  </div>

                  {/* Title */}
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-3/4" />
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-14" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="!-mt-4 space-y-4">
                {/* Summary section */}
                <div className="border-muted rounded-lg border-l-4 p-4">
                  <Skeleton className="mb-2 h-4 w-12" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>

                {/* Detailed summary grid */}
                <div className="rounded-xl bg-slate-100/40 p-4 dark:bg-slate-900/30">
                  <Skeleton className="mb-4 h-5 w-20" />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="space-y-2 rounded-lg border border-slate-200/60 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-800"
                        style={{
                          borderLeftWidth: '3px',
                          borderLeftColor: 'var(--tt-color-primary)',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                        <div className="space-y-1">
                          <Skeleton className="h-3.5 w-full" />
                          <Skeleton className="h-3.5 w-full" />
                          <Skeleton className="h-3.5 w-3/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer row */}
                <div className="flex items-center justify-between border-t pt-4">
                  <Skeleton className="h-6 w-24" />
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-10 w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="w-full shrink-0 lg:w-80">
            <div className="space-y-3">
              <Skeleton className="h-5 w-24" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
