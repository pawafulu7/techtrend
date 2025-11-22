'use client';

import { Button } from '@/components/ui/button';
import { SAMPLE_QUERIES, CATEGORY_LABELS, CATEGORY_ORDER, type SampleQuery } from '../_data/sample-queries';

interface AgentSampleQueriesProps {
  onSelectQuery: (query: string) => void;
  className?: string;
  queries?: readonly string[];
}

export function AgentSampleQueries({ onSelectQuery, className, queries }: AgentSampleQueriesProps) {
  if (queries && queries.length > 0) {
    return (
      <div className={className}>
        <div className="flex flex-wrap gap-2 justify-center max-w-3xl mx-auto">
          {queries.map((query, index) => (
            <Button
              key={`${query}-${index}`}
              variant="outline"
              size="sm"
              onClick={() => onSelectQuery(query)}
              className="text-xs h-7 whitespace-normal text-left max-w-xs"
              aria-label={query}
            >
              {query}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Group by category with proper typing
  const groupedQueries = SAMPLE_QUERIES.reduce<Record<SampleQuery['category'], SampleQuery[]>>(
    (acc, query) => {
      const category = query.category;
      const bucket = acc[category] ?? (acc[category] = []);
      bucket.push(query);
      return acc;
    },
    {} as Record<SampleQuery['category'], SampleQuery[]>
  );

  return (
    <div className={className}>
      <div className="space-y-3 max-w-3xl mx-auto">
        {CATEGORY_ORDER.map((category) => {
          const categoryQueries = groupedQueries[category];
          if (!categoryQueries || categoryQueries.length === 0) return null;

          return (
            <div key={category}>
              <p className="text-xs text-muted-foreground mb-1.5 text-center" data-testid="category-label">
                {CATEGORY_LABELS[category]}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {categoryQueries.map((query) => (
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
