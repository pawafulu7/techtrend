'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { parseSummary } from '@/lib/utils/summary-parser';

interface DetailedSummaryCardsProps {
  detailedSummary: string;
}

export function DetailedSummaryCards({ detailedSummary }: DetailedSummaryCardsProps) {
  const sections = parseSummary(detailedSummary);
  
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
    <div className="space-y-4">
      <p className="text-sm font-medium">記事の要約</p>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="text-base">{section.icon}</span>
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {section.content}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}