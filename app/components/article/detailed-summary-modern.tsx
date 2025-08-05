'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseSummary } from '@/lib/utils/summary-parser';
import { ArticleType } from '@/lib/utils/article-type-detector';

interface DetailedSummaryModernProps {
  detailedSummary: string;
  articleType?: ArticleType;
  summaryVersion?: number;
}

export function DetailedSummaryModern({ 
  detailedSummary, 
  articleType, 
  summaryVersion 
}: DetailedSummaryModernProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const sections = parseSummary(detailedSummary, { articleType, summaryVersion });
  
  // パース失敗時のフォールバック
  if (sections.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-gray-100">
          記事の要約
        </h3>
        <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
          {detailedSummary.split('\n').map((line, index) => (
            <p key={index} className="mb-2 leading-relaxed">
              {line.replace(/^・/, '')}
            </p>
          ))}
        </div>
      </div>
    );
  }

  const toggleSection = (index: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSections(newExpanded);
  };

  // セクションごとの色テーマ
  const getSectionTheme = (index: number) => {
    const themes = [
      'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-700',
      'from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-700',
      'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-700',
      'from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border-amber-200 dark:border-amber-700',
      'from-rose-50 to-rose-100 dark:from-rose-900/20 dark:to-rose-800/20 border-rose-200 dark:border-rose-700',
      'from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border-indigo-200 dark:border-indigo-700',
    ];
    return themes[index % themes.length];
  };

  // コンテンツを整形（箇条書き記号を削除し、要点を強調）
  const formatContent = (content: string) => {
    // 箇条書きの記号を削除
    let formatted = content.replace(/^[・]/, '').trim();
    
    // キーワードから始まる文を削除（例：「記事の主題は、」「具体的な問題は、」など）
    formatted = formatted
      .replace(/^記事の主題は、/, '')
      .replace(/^具体的な問題は、/, '')
      .replace(/^提示されている解決策は、/, '')
      .replace(/^実装方法の詳細については、/, '')
      .replace(/^期待される効果は、/, '')
      .replace(/^実装時の注意点は、/, '');

    return formatted;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">
        記事のポイント
      </h3>
      <div className="space-y-3">
        {sections.map((section, index) => {
          const isExpanded = expandedSections.has(index);
          const theme = getSectionTheme(index);
          const content = formatContent(section.content);

          return (
            <div
              key={index}
              className={cn(
                "bg-gradient-to-br rounded-xl border shadow-sm transition-all duration-300",
                theme,
                isExpanded ? "shadow-md" : "hover:shadow-md"
              )}
            >
              <button
                onClick={() => toggleSection(index)}
                className="w-full px-5 py-4 flex items-center justify-between text-left transition-colors hover:bg-white/30 dark:hover:bg-black/10 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden="true">
                    {section.icon}
                  </span>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {section.title}
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  {!isExpanded && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                      クリックして詳細を表示
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  )}
                </div>
              </button>
              
              <div
                className={cn(
                  "overflow-hidden transition-all duration-300",
                  isExpanded ? "max-h-96" : "max-h-0"
                )}
              >
                <div className="px-5 pb-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {content}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* 視覚的なヒント */}
      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          各セクションをクリックして詳細を確認できます
        </p>
      </div>
    </div>
  );
}