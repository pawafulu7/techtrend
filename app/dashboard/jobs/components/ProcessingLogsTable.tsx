'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { ProcessingLogsResponse, ProcessingLogEntry } from '../types';

interface ProcessingLogsTableProps {
  data: ProcessingLogsResponse | null;
  loading?: boolean;
}

/**
 * Get status badge variant and icon
 */
function getStatusBadge(status: ProcessingLogEntry['status']) {
  switch (status) {
    case 'success':
      return {
        variant: 'default' as const,
        className: 'bg-[var(--tt-color-positive)] hover:bg-[var(--tt-color-positive)]',
        icon: <CheckCircle className="h-3 w-3 mr-1" />,
        label: 'Success',
      };
    case 'failed':
      return {
        variant: 'destructive' as const,
        className: 'bg-[var(--tt-color-negative)] hover:bg-[var(--tt-color-negative)]',
        icon: <XCircle className="h-3 w-3 mr-1" />,
        label: 'Failed',
      };
    case 'partial':
      return {
        variant: 'secondary' as const,
        className: 'bg-[var(--tt-color-warning)] hover:bg-[var(--tt-color-warning)] text-white',
        icon: <AlertTriangle className="h-3 w-3 mr-1" />,
        label: 'Partial',
      };
    default:
      return {
        variant: 'outline' as const,
        className: '',
        icon: null,
        label: status,
      };
  }
}

/**
 * Format date for display
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Processing Log Row with expandable metadata
 */
function ProcessingLogRow({ log }: { log: ProcessingLogEntry }) {
  const [isOpen, setIsOpen] = useState(false);
  const statusBadge = getStatusBadge(log.status);
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <TableRow className="hover:bg-muted/50">
        <TableCell className="font-medium">{log.processName}</TableCell>
        <TableCell>
          <Badge variant={statusBadge.variant} className={statusBadge.className}>
            {statusBadge.icon}
            {statusBadge.label}
          </Badge>
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {log.processedCount.toLocaleString()}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatDate(log.lastProcessedAt)}
        </TableCell>
        <TableCell>
          {hasMetadata && (
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label={isOpen ? 'Collapse metadata' : 'Expand metadata'}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          )}
        </TableCell>
      </TableRow>
      {hasMetadata && (
        <CollapsibleContent asChild>
          <TableRow className="bg-muted/30">
            <TableCell colSpan={5} className="py-2">
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Metadata
                </p>
                <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

/**
 * Processing Logs Table Component
 */
export function ProcessingLogsTable({ data, loading }: ProcessingLogsTableProps) {
  if (loading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Processing Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-12 bg-muted animate-pulse rounded-md"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Processing Logs</span>
          <div className="flex items-center gap-2 text-sm font-normal">
            <Badge variant="outline" className="tabular-nums">
              {data.summary.total} total
            </Badge>
            <Badge
              variant="default"
              className="bg-[var(--tt-color-positive)] tabular-nums"
            >
              {data.summary.successRate}% success
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Process Name</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[100px] text-right">Processed</TableHead>
                <TableHead className="w-[180px]">Last Run</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.logs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No processing logs found
                  </TableCell>
                </TableRow>
              ) : (
                data.logs.map((log) => (
                  <ProcessingLogRow key={log.id} log={log} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
