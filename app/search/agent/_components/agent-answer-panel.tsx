'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Copy, Check } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';
import { AnswerContent } from './answer-content';
import { SourceReferences } from './source-references';

interface AgentAnswerPanelProps {
  result: AgentSearchResult | null;
  onFeedback?: (positive: boolean) => void;
}

export function AgentAnswerPanel({
  result,
  onFeedback,
}: AgentAnswerPanelProps) {
  const [copied, setCopied] = useState(false);
  const [emptyDelayPassed, setEmptyDelayPassed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const displayText = useMemo(() => {
    return result?.response || '';
  }, [result?.response]);

  // Empty state delay logic (150ms to prevent flicker)
  const hasContent = !!(displayText?.trim() || result?.articles?.length);
  useEffect(() => {
    if (hasContent) return;
    const timer = setTimeout(() => setEmptyDelayPassed(true), 150);
    return () => {
      clearTimeout(timer);
      setEmptyDelayPassed(false);
    };
  }, [hasContent]);
  const showEmptyState = !hasContent && emptyDelayPassed;

  const handleCopy = async () => {
    try {
      // Get rendered text (with tokens removed)
      const root = document.querySelector(
        '[data-testid="agent-answer-markdown"]'
      ) as HTMLElement | null;
      let copyText = displayText;
      if (root) {
        const clone = root.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[data-copy-exclude]').forEach((el) => {
          el.remove();
        });
        copyText = (clone.textContent ?? displayText).trim();
      }

      // Add sources (links to original articles)
      const safeArticles = result?.articles ?? [];
      if (safeArticles.length > 0) {
        const baseUrl =
          typeof window !== 'undefined' ? window.location.origin : '';
        const sourcesText = safeArticles
          .map((article) => {
            const title = article.translatedTitle || article.title;
            const url = `${baseUrl}/articles/${article.articleId}`;
            return `- [${title}](${url})`;
          })
          .join('\n');
        copyText += `\n\n出典:\n${sourcesText}`;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copyText);
        setCopied(true);
      } else {
        // Fallback for environments without clipboard API (e.g., headless browsers)
        const textarea = document.createElement('textarea');
        textarea.value = copyText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (success) {
          setCopied(true);
        }
      }
    } catch (error) {
      console.error('クリップボードへのコピーに失敗しました:', error);
    }
  };

  const articleCount = result?.articles?.length ?? 0;
  const totalTokens = result?.usage?.totalTokens;

  return (
    <CardV2
      variant="hover"
      className="border-l-4 border-[var(--tt-color-primary)] p-6"
      role="article"
      aria-labelledby="answer-heading"
      data-testid="agent-result-card"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2
              id="answer-heading"
              className="text-xl font-semibold md:text-2xl"
            >
              AI回答
            </h2>
            {result?.cached && (
              <BadgeV2 variant="secondary" className="text-xs">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                キャッシュ
              </BadgeV2>
            )}
            {result?.fallback && (
              <BadgeV2
                variant="outline"
                className="border-[var(--tt-color-warning)] text-xs text-[var(--tt-color-warning)]"
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                フォールバック
              </BadgeV2>
            )}
          </div>
          {articleCount > 0 && (
            <p className="text-sm text-[var(--tt-color-text-muted)]">
              {articleCount}件の記事から生成
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ButtonV2
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 gap-1.5 px-3"
            aria-label="回答をコピー"
          >
            {copied ? (
              <>
                <Check
                  className="h-4 w-4 text-[var(--tt-color-primary)]"
                  aria-hidden="true"
                />
                <span className="text-xs text-[var(--tt-color-primary)]">
                  コピー完了
                </span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span className="hidden text-xs sm:inline">コピー</span>
              </>
            )}
          </ButtonV2>
        </div>
      </div>

      {result?.fallback && (
        <div className="mb-4 rounded-md border border-[var(--tt-color-warning)]/30 bg-[var(--tt-color-warning)]/10 p-3">
          <p className="text-sm text-[var(--tt-color-text)]">
            AI検索が一時的に利用できないため、通常の検索結果を表示しています
          </p>
        </div>
      )}

      <AnswerContent
        result={result}
        displayText={displayText}
        showEmptyState={showEmptyState}
      />

      <SourceReferences
        totalTokens={totalTokens}
        resultQuery={result?.query}
        onFeedback={onFeedback}
      />
    </CardV2>
  );
}
