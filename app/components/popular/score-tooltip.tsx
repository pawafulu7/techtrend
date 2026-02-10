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
          className="bg-popover text-popover-foreground border-border min-w-[180px] rounded-lg border p-3 shadow-md"
          sideOffset={8}
        >
          <table className="w-full text-xs" role="table">
            <caption className="sr-only">スコア内訳</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="text-muted-foreground pb-2 text-left font-medium"
                >
                  指標
                </th>
                <th
                  scope="col"
                  className="text-muted-foreground pb-2 text-right font-medium"
                >
                  値
                </th>
              </tr>
            </thead>
            <tbody className="divide-border/50 divide-y">
              <tr>
                <td className="text-foreground py-1.5">総合スコア</td>
                <td className="text-foreground py-1.5 text-right font-semibold tabular-nums">
                  {formatValue(score)}
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-1.5">ブックマーク</td>
                <td className="text-foreground py-1.5 text-right font-semibold tabular-nums">
                  {formatValue(bookmarks)}
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-1.5">投票</td>
                <td className="text-foreground py-1.5 text-right font-semibold tabular-nums">
                  {formatValue(votes)}
                </td>
              </tr>
              <tr>
                <td className="text-foreground py-1.5">品質スコア</td>
                <td className="text-foreground py-1.5 text-right font-semibold tabular-nums">
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
