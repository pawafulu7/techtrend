'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, AlertCircle, Settings2 } from 'lucide-react';
import { useJobsPolling, usePollingControl } from '../hooks/useJobsPolling';
import { SummaryCardsSection } from './SummaryCardsSection';
import { ProcessingLogsTable } from './ProcessingLogsTable';
import { EmbeddingJobsPanel } from './EmbeddingJobsPanel';
import { ArticleCollectionStats } from './ArticleCollectionStats';

/**
 * Date range options for article stats
 */
const DATE_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
];

/**
 * Job Management Dashboard
 * Main client component for monitoring jobs and processing status
 */
export default function JobManagementDashboard() {
  const [dateRange, setDateRange] = useState('7d');
  const { isActive, interval, pause, resume } = usePollingControl(30000);

  const {
    processingLogs,
    embeddingSummary,
    articleStats,
    loading,
    error,
    lastUpdated,
    refresh,
  } = useJobsPolling(interval, isActive, dateRange);

  const handleRefresh = async () => {
    await refresh();
  };

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Job Management Dashboard
          </h1>
          <p className="text-muted-foreground">
            Monitor processing logs, embedding jobs, and article collection
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date Range Selector */}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Polling Control */}
          <Button
            variant="outline"
            size="sm"
            onClick={isActive ? pause : resume}
            className="gap-2"
          >
            <Settings2 className="h-4 w-4" />
            {isActive ? 'Pause' : 'Resume'}
          </Button>

          {/* Manual Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isActive ? 'bg-green-500' : 'bg-yellow-500'
            }`}
          />
          <span>
            {isActive
              ? `Auto-refresh every ${interval / 1000}s`
              : 'Auto-refresh paused'}
          </span>
        </div>
        {lastUpdated && <span>Last updated: {lastUpdated}</span>}
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <SummaryCardsSection
        processingLogs={processingLogs}
        embeddingSummary={embeddingSummary}
        articleStats={articleStats}
        loading={loading && !processingLogs}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Processing Logs */}
        <div className="lg:col-span-2">
          <ProcessingLogsTable
            data={processingLogs}
            loading={loading && !processingLogs}
          />
        </div>

        {/* Embedding Jobs */}
        <EmbeddingJobsPanel
          data={embeddingSummary}
          loading={loading && !embeddingSummary}
        />

        {/* Article Collection Stats */}
        <ArticleCollectionStats
          data={articleStats}
          loading={loading && !articleStats}
        />
      </div>
    </div>
  );
}
