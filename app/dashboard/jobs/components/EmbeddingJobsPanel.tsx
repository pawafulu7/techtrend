'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui-v2/card-v2';
import { Badge } from '@/components/ui-v2/badge-v2';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Clock,
  CheckCircle2,
  Loader2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import type { EmbeddingSummaryResponse, StuckJob, HighRetryJob } from '../types';

interface EmbeddingJobsPanelProps {
  data: EmbeddingSummaryResponse | null;
  loading?: boolean;
}

/**
 * Status card for embedding job counts
 */
function StatusCard({
  label,
  count,
  icon,
  colorClass,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${colorClass}`}>
      {icon}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{count.toLocaleString()}</p>
      </div>
    </div>
  );
}

/**
 * Stuck Jobs Alert Section
 */
function StuckJobsAlert({ jobs }: { jobs: StuckJob[] }) {
  if (jobs.length === 0) return null;

  return (
    <Alert variant="destructive" className="mt-4">
      <Clock className="h-4 w-4" />
      <AlertTitle>Stuck Jobs Detected ({jobs.length})</AlertTitle>
      <AlertDescription>
        <p className="mb-2 text-sm">
          The following jobs have been processing for longer than expected:
        </p>
        <div className="rounded-md border border-destructive/20 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Article ID</TableHead>
                <TableHead className="w-[100px]">Duration</TableHead>
                <TableHead className="w-[80px]">Attempts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.slice(0, 5).map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-xs">
                    {job.articleId.substring(0, 20)}...
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {job.durationMinutes} min
                  </TableCell>
                  <TableCell className="tabular-nums">{job.attempts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {jobs.length > 5 && (
          <p className="mt-2 text-xs text-muted-foreground">
            ...and {jobs.length - 5} more
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * High Retry Jobs Warning Section
 */
function HighRetryJobsWarning({ jobs }: { jobs: HighRetryJob[] }) {
  if (jobs.length === 0) return null;

  return (
    <Alert className="mt-4 border-[var(--tt-color-warning)]">
      <RefreshCw className="h-4 w-4 text-[var(--tt-color-warning)]" />
      <AlertTitle className="text-[var(--tt-color-warning)]">
        High Retry Jobs ({jobs.length})
      </AlertTitle>
      <AlertDescription>
        <p className="mb-2 text-sm">
          Jobs with multiple retry attempts that may need attention:
        </p>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Article ID</TableHead>
                <TableHead className="w-[100px]">Attempts</TableHead>
                <TableHead className="w-[100px]">Remaining</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.slice(0, 5).map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-xs">
                    {job.articleId.substring(0, 20)}...
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {job.attempts}/{job.maxAttempts}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {job.retriesRemaining}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {job.error || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {jobs.length > 5 && (
          <p className="mt-2 text-xs text-muted-foreground">
            ...and {jobs.length - 5} more
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Embedding Jobs Panel Component
 */
export function EmbeddingJobsPanel({ data, loading }: EmbeddingJobsPanelProps) {
  if (loading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Embedding Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-20 bg-muted animate-pulse rounded-lg"
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { statusCounts, completionRate, stuckJobs, highRetryJobs } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Embedding Jobs</span>
          <Badge variant="outline" className="tabular-nums">
            {statusCounts.total.toLocaleString()} total
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Completion Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Completion Rate</span>
            <span className="text-sm font-bold tabular-nums">
              {completionRate.toFixed(1)}%
            </span>
          </div>
          <Progress value={completionRate} className="h-2" />
        </div>

        {/* Status Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatusCard
            label="Pending"
            count={statusCounts.PENDING}
            icon={<Clock className="h-5 w-5 text-muted-foreground" />}
            colorClass="bg-muted"
          />
          <StatusCard
            label="Processing"
            count={statusCounts.PROCESSING}
            icon={<Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
            colorClass="bg-blue-50 dark:bg-blue-950"
          />
          <StatusCard
            label="Completed"
            count={statusCounts.COMPLETED}
            icon={<CheckCircle2 className="h-5 w-5 text-[var(--tt-color-positive)]" />}
            colorClass="bg-green-50 dark:bg-green-950"
          />
          <StatusCard
            label="Failed"
            count={statusCounts.FAILED}
            icon={<XCircle className="h-5 w-5 text-[var(--tt-color-negative)]" />}
            colorClass="bg-red-50 dark:bg-red-950"
          />
        </div>

        {/* Alerts for problematic jobs */}
        <StuckJobsAlert jobs={stuckJobs} />
        <HighRetryJobsWarning jobs={highRetryJobs} />
      </CardContent>
    </Card>
  );
}
