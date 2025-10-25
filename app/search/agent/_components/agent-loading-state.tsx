'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const STATUS_MESSAGES = [
  'AIが要約を生成中...',
  '関連資料を分析中...',
  '結果をまとめています...',
] as const;

const STATUS_DURATIONS = [3000, 3000, 6000];

interface AgentLoadingStateProps {
  className?: string;
  progress?: number;
}

export function AgentLoadingState({ className, progress: externalProgress }: AgentLoadingStateProps) {
  const [statusIndex, setStatusIndex] = useState(0);
  const [internalProgress, setInternalProgress] = useState(0);

  const progress = externalProgress ?? internalProgress;

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, STATUS_DURATIONS[statusIndex]);

    return () => clearTimeout(timer);
  }, [statusIndex]);

  useEffect(() => {
    if (externalProgress !== undefined) {
      return;
    }

    const startTime = Date.now();
    const duration = 8000;

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // Progress smoothly to 95% (never goes backwards)
      // Parent component should set to 100% on completion
      const newProgress = Math.min(95, (elapsed / duration) * 95);
      setInternalProgress(newProgress);
    }, 100);

    return () => clearInterval(progressInterval);
  }, [externalProgress]);

  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-center gap-3 mb-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-base font-medium">
          {STATUS_MESSAGES[statusIndex]}
        </span>
      </div>

      <Progress
        value={progress}
        className="h-1 mb-6"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      />

      <div className="space-y-3">
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '90%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '85%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '70%' }} />
        <div className="h-4 bg-muted rounded animate-pulse mt-6" style={{ width: '40%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '95%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '80%' }} />
      </div>
    </div>
  );
}
