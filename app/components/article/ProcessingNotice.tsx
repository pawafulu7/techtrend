'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { Info } from 'lucide-react';

interface ProcessingNoticeProps {
  isVisible: boolean;
  articleCount?: number;
}

/**
 * 処理中の記事が除外されていることを通知するコンポーネント
 */
export default function ProcessingNotice({
  isVisible,
  articleCount,
}: ProcessingNoticeProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="mb-4">
      <Card className="border-[var(--tt-color-info-border)] bg-[var(--tt-color-info-bg)]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--tt-color-info)]">
            <Info className="h-5 w-5" />
            要約未生成の記事を非表示にしています
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[var(--tt-color-info)]">
          <p>新しく取得した記事の要約生成には時間がかかるため、</p>
          <p>要約が完成していない記事は一時的に非表示にしています。</p>
          {articleCount && articleCount > 0 && (
            <p className="mt-2">非表示中の記事: 約{articleCount}件</p>
          )}
          <p className="mt-2">要約が完成次第、自動的に表示されます。</p>
        </CardContent>
      </Card>
    </div>
  );
}
