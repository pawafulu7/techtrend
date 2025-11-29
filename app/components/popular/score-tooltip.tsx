'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ScoreTooltipProps {
  score: number;
  bookmarks: number;
  votes: number;
  qualityScore: number;
  children: React.ReactNode;
  className?: string;
}

function formatValue(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '\u2014'; // em dash
  }
  return Math.floor(value).toLocaleString();
}

export function ScoreTooltip({
  score,
  bookmarks,
  votes,
  qualityScore,
  children,
  className,
}: ScoreTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={cn('cursor-help', className)}>{children}</span>
        </TooltipTrigger>
        <TooltipContent
          className="min-w-[180px] p-3 bg-popover text-popover-foreground border border-border rounded-lg shadow-md"
          sideOffset={8}
        >
          <table className="w-full text-xs" role="table">
            <caption className="sr-only">Score breakdown</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left font-medium text-muted-foreground pb-2">
                  Metric
                </th>
                <th scope="col" className="text-right font-medium text-muted-foreground pb-2">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <tr>
                <td className="py-1.5 text-foreground">Total Score</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-foreground">
                  {formatValue(score)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-foreground">Bookmarks</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-foreground">
                  {formatValue(bookmarks)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-foreground">Votes</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-foreground">
                  {formatValue(votes)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-foreground">Quality</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-foreground">
                  {formatValue(qualityScore)}
                </td>
              </tr>
            </tbody>
          </table>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
