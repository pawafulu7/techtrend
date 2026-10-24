'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { Badge } from '@/components/ui-v2/badge-v2';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Calendar, TrendingUp } from 'lucide-react';
import type { ArticleStatsResponse, SourceStats, DailyStats } from '../types';

interface ArticleCollectionStatsProps {
  data: ArticleStatsResponse | null;
  loading?: boolean;
}

/**
 * Source Statistics Table
 */
function SourceStatsTable({ sources }: { sources: SourceStats[] }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px]">Source</TableHead>
            <TableHead className="w-[100px] text-right">Articles</TableHead>
            <TableHead className="w-[150px]">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-muted-foreground py-8 text-center"
              >
                No source data available
              </TableCell>
            </TableRow>
          ) : (
            sources.map((source) => (
              <TableRow key={source.source}>
                <TableCell className="font-medium">{source.source}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {source.count.toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={source.percentage} className="h-2 w-20" />
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {source.percentage}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Daily Statistics Table
 */
function DailyStatsTable({ dailyStats }: { dailyStats: DailyStats[] }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">Date</TableHead>
            <TableHead className="w-[100px] text-right">Total</TableHead>
            <TableHead className="w-[120px] text-right">With Summary</TableHead>
            <TableHead className="w-[150px]">Summary Rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dailyStats.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-muted-foreground py-8 text-center"
              >
                No daily data available
              </TableCell>
            </TableRow>
          ) : (
            dailyStats.map((day) => (
              <TableRow key={day.date}>
                <TableCell className="font-medium">{day.date}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {day.total.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {day.withSummary.toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={day.summaryRate} className="h-2 w-20" />
                    <span
                      className={`text-sm tabular-nums ${
                        day.summaryRate >= 80
                          ? 'text-[var(--tt-color-positive)]'
                          : day.summaryRate >= 50
                            ? 'text-[var(--tt-color-warning)]'
                            : 'text-[var(--tt-color-negative)]'
                      }`}
                    >
                      {day.summaryRate}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Article Collection Statistics Component
 */
export function ArticleCollectionStats({
  data,
  loading,
}: ArticleCollectionStatsProps) {
  if (loading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Article Collection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="bg-muted h-20 flex-1 animate-pulse rounded-lg"
                />
              ))}
            </div>
            <div className="bg-muted h-[200px] animate-pulse rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const { bySource, byDate, totals, period } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Article Collection</span>
          <Badge variant="outline" className="text-xs">
            {period.start} ~ {period.end} ({period.days} days)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bg-muted flex items-center gap-3 rounded-lg p-4">
            <FileText className="text-muted-foreground h-8 w-8" />
            <div>
              <p className="text-muted-foreground text-sm">Total Articles</p>
              <p className="text-2xl font-bold tabular-nums">
                {totals.articles.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-[var(--tt-color-positive-bg)] p-4">
            <TrendingUp className="h-8 w-8 text-[var(--tt-color-positive)]" />
            <div>
              <p className="text-muted-foreground text-sm">With Summaries</p>
              <p className="text-2xl font-bold tabular-nums">
                {totals.summaries.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-[var(--tt-color-info-bg)] p-4">
            <Calendar className="h-8 w-8 text-[var(--tt-color-info)]" />
            <div>
              <p className="text-muted-foreground text-sm">Summary Rate</p>
              <p className="text-2xl font-bold tabular-nums">
                {totals.overallRate}%
              </p>
            </div>
          </div>
        </div>

        {/* Tabbed View for Source and Daily Stats */}
        <Tabs defaultValue="source" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="source">By Source</TabsTrigger>
            <TabsTrigger value="daily">Daily Trend</TabsTrigger>
          </TabsList>
          <TabsContent value="source" className="mt-4">
            <SourceStatsTable sources={bySource} />
          </TabsContent>
          <TabsContent value="daily" className="mt-4">
            <DailyStatsTable dailyStats={byDate} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
