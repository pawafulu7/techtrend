'use client';

import { useState } from 'react';
import { Info, Lightbulb, Code, TrendingUp, AlertTriangle, Layers } from 'lucide-react';
import { parseSummary } from '@/lib/utils/summary-parser';
import { ArticleType } from '@/lib/utils/article-type-detector';
import { cn } from '@/lib/utils';

interface DetailedSummaryCompactProps {
  detailedSummary: string;
  articleType?: ArticleType;
  summaryVersion?: number;
}

// アイコンマッピング
const iconMap: Record<string, React.ReactNode> = {
  '📋': <Layers className="h-5 w-5" />,
  '❓': <Info className="h-5 w-5" />,
  '💡': <Lightbulb className="h-5 w-5" />,
  '🔧': <Code className="h-5 w-5" />,
  '📈': <TrendingUp className="h-5 w-5" />,
  '⚠️': <AlertTriangle className="h-5 w-5" />,
};

export function DetailedSummaryCompact({ 
  detailedSummary, 
  articleType, 
  summaryVersion 
}: DetailedSummaryCompactProps) {
  const [selectedSection, setSelectedSection] = useState(0);
  const sections = parseSummary(detailedSummary, { articleType, summaryVersion });
  
  // パース失敗時のフォールバック
  if (sections.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
            記事の要約
          </h3>
          <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
            {detailedSummary.split('\n').map((line, index) => (
              <p key={index} className="mb-3 leading-relaxed">
                {line.replace(/^・/, '').trim()}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // コンテンツを整形
  const formatContent = (content: string) => {
    let formatted = content.replace(/^[・]/, '').trim();
    formatted = formatted
      .replace(/^記事の主題は、/, '')
      .replace(/^具体的な問題は、/, '')
      .replace(/^提示されている解決策は、/, '')
      .replace(/^実装方法の詳細については、/, '')
      .replace(/^期待される効果は、/, '')
      .replace(/^実装時の注意点は、/, '');
    return formatted;
  };

  const selectedContent = sections[selectedSection] ? formatContent(sections[selectedSection].content) : '';

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden">
      {/* タブナビゲーション */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex overflow-x-auto scrollbar-hide">
          {sections.map((section, index) => {
            const Icon = iconMap[section.icon || ''] || section.icon;
            return (
              <button
                key={index}
                onClick={() => setSelectedSection(index)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all",
                  "hover:bg-gray-50 dark:hover:bg-gray-800",
                  selectedSection === index
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                    : "text-gray-600 dark:text-gray-400"
                )}
              >
                {typeof Icon === 'string' ? (
                  <span className="text-base">{Icon}</span>
                ) : (
                  Icon
                )}
                <span>{section.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* コンテンツ表示エリア */}
      <div className="p-6">
        <div className="space-y-4">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {sections[selectedSection]?.title}
          </h4>
          <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {selectedContent.split('\n').map((line, lineIndex) => (
              <p key={lineIndex} className={lineIndex > 0 ? 'mt-2' : ''}>
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* ナビゲーションドット */}
        <div className="flex items-center justify-center gap-1.5 mt-6">
          {sections.map((_, index) => (
            <button
              key={index}
              onClick={() => setSelectedSection(index)}
              className={cn(
                "h-2 rounded-full transition-all",
                selectedSection === index
                  ? "w-8 bg-blue-600 dark:bg-blue-400"
                  : "w-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
              )}
              aria-label={`セクション ${index + 1} に移動`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}