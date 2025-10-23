'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

interface AgentAnswerPanelProps {
  result: AgentSearchResult;
  onFeedback?: (positive: boolean) => void;
}

export function AgentAnswerPanel({ result, onFeedback }: AgentAnswerPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-card border rounded-lg shadow-sm p-6" role="article" aria-labelledby="answer-heading">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 id="answer-heading" className="text-lg font-semibold">
            AI回答
          </h2>
          {result.cached && (
            <Badge variant="secondary" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              キャッシュ
            </Badge>
          )}
          {result.fallback && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              フォールバック
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 w-8 p-0"
            aria-label="回答をコピー"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {result.fallback && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            AI検索が一時的に利用できないため、通常の検索結果を表示しています
          </p>
        </div>
      )}

      <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ node, ...props }) => (
              <a {...props} target="_blank" rel="noopener noreferrer" />
            ),
          }}
        >
          {result.response}
        </ReactMarkdown>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-xs text-muted-foreground">
          {result.usage?.totalTokens && (
            <span>トークン使用: {result.usage.totalTokens.toLocaleString()}</span>
          )}
        </div>

        {onFeedback && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">この回答は役立ちましたか？</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFeedback(true)}
              className="h-7 w-7 p-0"
              aria-label="良い"
            >
              <ThumbsUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFeedback(false)}
              className="h-7 w-7 p-0"
              aria-label="悪い"
            >
              <ThumbsDown className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
