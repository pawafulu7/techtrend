'use client';

import { parseSummary } from '@/lib/utils/summary-parser';
import { ArticleType } from '@/lib/utils/article-type-detector';
import { cn } from '@/lib/utils';

interface DetailedSummaryTimelineProps {
  detailedSummary: string;
  articleType?: ArticleType;
  summaryVersion?: number;
}

export function DetailedSummaryTimeline({ 
  detailedSummary, 
  articleType, 
  summaryVersion 
}: DetailedSummaryTimelineProps) {
  const sections = parseSummary(detailedSummary, { articleType, summaryVersion });
  
  // パース失敗時のフォールバック
  if (sections.length === 0) {
    return (
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-2xl p-6 shadow-sm">
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

  // タイムラインの色を取得
  const getTimelineColor = (index: number) => {
    const colors = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-green-500',
      'bg-amber-500',
      'bg-rose-500',
      'bg-indigo-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        記事のポイント
      </h3>
      
      <div className="relative">
        {/* タイムライン軸 */}
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
        
        {/* タイムラインアイテム */}
        <div className="space-y-6">
          {sections.map((section, index) => {
            const content = formatContent(section.content);
            const timelineColor = getTimelineColor(index);
            
            return (
              <div key={index} className="relative flex gap-4 group">
                {/* タイムラインドット */}
                <div className="relative z-10 flex items-center justify-center">
                  <div 
                    className={cn(
                      "w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110",
                      timelineColor
                    )}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {section.icon}
                    </span>
                  </div>
                  {/* 接続線のアニメーション */}
                  {index < sections.length - 1 && (
                    <div className="absolute top-16 left-1/2 transform -translate-x-1/2 w-0.5 h-6 bg-gradient-to-b from-gray-200 to-transparent dark:from-gray-700" />
                  )}
                </div>
                
                {/* コンテンツカード */}
                <div className="flex-1 pb-6">
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 transition-all group-hover:shadow-md">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {section.title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      {content}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* プログレスインジケーター */}
      <div className="mt-8 flex items-center justify-center gap-2">
        {sections.map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-1.5 rounded-full transition-all",
              getTimelineColor(index),
              "w-12"
            )}
          />
        ))}
      </div>
    </div>
  );
}