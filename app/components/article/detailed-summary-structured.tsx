'use client';

import { parseSummary } from '@/lib/utils/summary-parser';
import { ArticleType } from '@/lib/utils/article-type-detector';

interface DetailedSummaryStructuredProps {
  detailedSummary: string;
  articleType?: ArticleType;
  summaryVersion?: number;
}

export function DetailedSummaryStructured({ 
  detailedSummary, 
  articleType, 
  summaryVersion 
}: DetailedSummaryStructuredProps) {
  const sections = parseSummary(detailedSummary, { articleType, summaryVersion });
  
  // パース失敗時のフォールバック
  if (sections.length === 0) {
    return (
      <div className="p-4 bg-muted rounded-lg">
        <p className="text-sm font-medium mb-2">記事の要約</p>
        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
          {detailedSummary}
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-4 bg-muted rounded-lg">
      <p className="text-sm font-medium mb-4">記事の要約</p>
      <div className="space-y-4">
        {sections.map((section, index) => (
          <div key={index} className="border-l-2 border-muted-foreground/20 pl-4">
            <h4 className="font-semibold text-sm mb-1 flex items-center gap-2">
              <span className="text-base">{section.icon}</span>
              {section.title}
            </h4>
            <div className="text-sm text-muted-foreground leading-relaxed">
              {section.content.split('\n').map((line, lineIndex) => (
                <p key={lineIndex} className={lineIndex > 0 ? 'mt-2' : ''}>
                  {highlightContent(line)}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 重要な部分を強調表示する関数
function highlightContent(content: string): React.ReactNode {
  // 重要なキーワードのパターン
  const patterns = [
    { regex: /問題は(.+?)である/g, style: 'font-semibold text-destructive' },
    { regex: /解決策は(.+?)である/g, style: 'font-semibold text-primary' },
    { regex: /効果は(.+?)である/g, style: 'font-semibold text-green-700 dark:text-green-400' },
    { regex: /注意点は(.+?)である/g, style: 'font-semibold text-orange-600 dark:text-orange-400' }
  ];
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const matches: { start: number; end: number; text: string; style: string }[] = [];
  
  // すべてのマッチを収集
  patterns.forEach(({ regex, style }) => {
    const regexCopy = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = regexCopy.exec(content)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        style
      });
    }
  });
  
  // マッチを開始位置でソート
  matches.sort((a, b) => a.start - b.start);
  
  // テキストを分割して強調表示
  matches.forEach((match, index) => {
    // マッチ前のテキスト
    if (match.start > lastIndex) {
      parts.push(content.substring(lastIndex, match.start));
    }
    
    // 強調表示されたテキスト
    parts.push(
      <span key={index} className={match.style}>
        {match.text}
      </span>
    );
    
    lastIndex = match.end;
  });
  
  // 最後の部分
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : content;
}