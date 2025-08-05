'use client';

import { DetailedSummaryStructured } from './detailed-summary-structured';
import { DetailedSummaryCards } from './detailed-summary-cards';
import { DetailedSummaryModern } from './detailed-summary-modern';
import { DetailedSummaryTimeline } from './detailed-summary-timeline';
import { DetailedSummaryCompact } from './detailed-summary-compact';
import { ArticleType } from '@/lib/utils/article-type-detector';

interface DetailedSummaryDisplayProps {
  articleId: string;
  detailedSummary: string;
  articleType?: ArticleType;
  summaryVersion?: number;
}

export function DetailedSummaryDisplay({ 
  articleId, 
  detailedSummary,
  articleType,
  summaryVersion 
}: DetailedSummaryDisplayProps) {
  // 記事IDの最後の文字を数値として取得
  const lastChar = articleId.charAt(articleId.length - 1);
  const lastDigit = parseInt(lastChar, 36); // 36進数として解釈（0-9, a-z）
  
  // 5種類の表示形式をローテーション
  const displayType = lastDigit % 5;
  
  switch (displayType) {
    case 0:
      return <DetailedSummaryModern 
        detailedSummary={detailedSummary} 
        articleType={articleType}
        summaryVersion={summaryVersion}
      />;
    case 1:
      return <DetailedSummaryTimeline 
        detailedSummary={detailedSummary}
        articleType={articleType}
        summaryVersion={summaryVersion}
      />;
    case 2:
      return <DetailedSummaryCompact 
        detailedSummary={detailedSummary}
        articleType={articleType}
        summaryVersion={summaryVersion}
      />;
    case 3:
      return <DetailedSummaryCards 
        detailedSummary={detailedSummary}
        articleType={articleType}
        summaryVersion={summaryVersion}
      />;
    default:
      return <DetailedSummaryStructured 
        detailedSummary={detailedSummary} 
        articleType={articleType}
        summaryVersion={summaryVersion}
      />;
  }
}