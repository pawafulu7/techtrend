'use client';

import { DetailedSummaryStructured } from './detailed-summary-structured';
import { ArticleType } from '@/lib/utils/article-type-detector';

interface DetailedSummaryDisplayProps {
  detailedSummary: string;
  articleType?: ArticleType;
  summaryVersion?: number;
}

export function DetailedSummaryDisplay({
  detailedSummary,
  articleType,
  summaryVersion
}: DetailedSummaryDisplayProps) {
  return (
    <DetailedSummaryStructured
      detailedSummary={detailedSummary}
      articleType={articleType}
      summaryVersion={summaryVersion}
    />
  );
}