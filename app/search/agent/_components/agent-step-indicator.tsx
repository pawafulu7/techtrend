'use client';

import { Search, Brain, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SearchStep } from '@/lib/hooks/useAgentSearch';

export type { SearchStep };

interface AgentStepIndicatorProps {
  currentStep: SearchStep;
  isTimedOut?: boolean;
  className?: string;
}

const STEPS = [
  { id: 'searching', label: '記事検索', icon: Search },
  { id: 'analyzing', label: 'AI分析', icon: Brain },
  { id: 'generating', label: '回答生成', icon: FileText },
] as const;

type StepId = (typeof STEPS)[number]['id'];

function getStepStatus(
  stepId: StepId,
  currentStep: SearchStep
): 'complete' | 'active' | 'pending' {
  const stepOrder: Record<StepId, number> = {
    searching: 0,
    analyzing: 1,
    generating: 2,
  };

  if (currentStep === 'complete') {
    return 'complete';
  }

  if (currentStep === 'error') {
    const currentIndex = stepOrder[stepId];
    // Mark steps before error as complete, current as active (error state)
    if (currentIndex < stepOrder.generating) {
      return 'complete';
    }
    return 'pending';
  }

  if (currentStep === 'idle') {
    return 'pending';
  }

  const currentIndex = stepOrder[currentStep as StepId] ?? -1;
  const thisIndex = stepOrder[stepId];

  if (thisIndex < currentIndex) {
    return 'complete';
  }
  if (thisIndex === currentIndex) {
    return 'active';
  }
  return 'pending';
}

export function AgentStepIndicator({
  currentStep,
  isTimedOut = false,
  className,
}: AgentStepIndicatorProps) {
  const isError = currentStep === 'error';
  const isComplete = currentStep === 'complete';

  return (
    <div
      className={cn('flex flex-col items-center gap-4', className)}
      role="status"
      aria-live="polite"
      data-testid="agent-step-indicator"
    >
      <div className="flex justify-between items-center w-full max-w-md">
        {STEPS.map((step, index) => {
          const status = getStepStatus(step.id, currentStep);
          const Icon = step.icon;
          const isLast = index === STEPS.length - 1;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300',
                    status === 'complete' &&
                      'bg-[var(--tt-color-primary)] text-white',
                    status === 'active' &&
                      'bg-[var(--tt-color-primary)]/20 text-[var(--tt-color-primary)] ring-4 ring-[var(--tt-color-primary)]/30 animate-pulse',
                    status === 'pending' &&
                      'bg-[var(--tt-color-surface-muted)] text-[var(--tt-color-text-muted)]'
                  )}
                  aria-current={status === 'active' ? 'step' : undefined}
                >
                  {status === 'complete' ? (
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs font-medium transition-colors duration-300',
                    status === 'active' && 'text-[var(--tt-color-primary)]',
                    status === 'complete' && 'text-[var(--tt-color-primary)]',
                    status === 'pending' && 'text-[var(--tt-color-text-muted)]'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 transition-colors duration-300',
                    getStepStatus(STEPS[index + 1].id, currentStep) !== 'pending'
                      ? 'bg-[var(--tt-color-primary)]'
                      : 'bg-[var(--tt-color-border)]'
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Status message */}
      {isTimedOut && !isComplete && !isError && (
        <p className="text-sm text-[var(--tt-color-text-muted)] animate-pulse">
          まだ処理中です...しばらくお待ちください
        </p>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-sm text-[var(--tt-color-warning)]">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <span>エラーが発生しました</span>
        </div>
      )}

      {isComplete && (
        <p className="text-sm text-[var(--tt-color-primary)] font-medium">
          回答の生成が完了しました
        </p>
      )}
    </div>
  );
}
