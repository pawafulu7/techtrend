'use client';

import { Button } from '@/components/ui/button';
import { SAMPLE_QUERIES, CATEGORY_LABELS, CATEGORY_ORDER, type SampleQuery } from '../_data/sample-queries';

interface AgentSampleQueriesProps {
  onSelectQuery: (query: string) => void;
  className?: string;
}

export function AgentSampleQueries({ onSelectQuery, className }: AgentSampleQueriesProps) {
  // Group by category with proper typing
  const groupedQueries = SAMPLE_QUERIES.reduce((acc, query) => {
    if (!acc[query.category]) {
      acc[query.category] = [];
    }
    acc[query.category].push(query);
    return acc;
  }, {} as Record<SampleQuery['category'], SampleQuery[]>);

  return (
    <div className={className}>
      <div className="space-y-3 max-w-3xl mx-auto">
        {CATEGORY_ORDER.map((category) => {
          const queries = groupedQueries[category];
          if (!queries || queries.length === 0) return null;

          return (
            <div key={category}>
              <p className="text-xs text-muted-foreground mb-1.5 text-center" data-testid="category-label">
                {CATEGORY_LABELS[category]}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {queries.map((query) => (
                  <Button
                    key={query.id}
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectQuery(query.text)}
                    className="text-xs h-7 whitespace-normal text-left max-w-xs"
                    aria-label={query.text}
                  >
                    {query.text}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
