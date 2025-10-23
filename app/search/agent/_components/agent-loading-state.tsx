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
}

export function AgentLoadingState({ className }: AgentLoadingStateProps) {
  const [statusIndex, setStatusIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, STATUS_DURATIONS[statusIndex]);

    return () => clearInterval(interval);
  }, [statusIndex]);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 8000;

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(90, (elapsed / duration) * 90);
      setProgress(newProgress);

      if (newProgress >= 90) {
        setTimeout(() => setProgress(60), 500);
      }
    }, 100);

    return () => clearInterval(progressInterval);
  }, []);

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
