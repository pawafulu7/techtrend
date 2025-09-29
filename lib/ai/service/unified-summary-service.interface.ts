export type SummaryServiceParams = {
  title: string;
  content: string;
  articleType?: 'technical' | 'news' | 'tutorial' | 'opinion';
  qualityThreshold?: number;
};

export type SummaryServiceResult = {
  summary: string;
  detailedSummary: string;
  category?: string;
  tags?: string[];
  qualityScore: number;
  processingTimeMs: number;
  summaryVersion: number;
};

export interface UnifiedSummaryService {
  generateSummary(params: SummaryServiceParams): Promise<SummaryServiceResult>;
}