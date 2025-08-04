'use client';

import { DetailedSummaryStructured } from './detailed-summary-structured';
import { DetailedSummaryCards } from './detailed-summary-cards';
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
  
  // 偶数の場合は構造化リスト、奇数の場合はカード形式
  const isEven = lastDigit % 2 === 0;
  
  if (isEven) {
    return <DetailedSummaryStructured 
      detailedSummary={detailedSummary} 
      articleType={articleType}
      summaryVersion={summaryVersion}
    />;
  } else {
    return <DetailedSummaryCards 
      detailedSummary={detailedSummary}
      articleType={articleType}
      summaryVersion={summaryVersion}
    />;
  }
}