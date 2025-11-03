export type SummaryServiceParams = {
  title: string;
  content: string;
  articleType?: 'technical' | 'news' | 'tutorial' | 'opinion';
  qualityThreshold?: number;
  articleId?: string; // Optional: Required for automatic embedding job creation
};

export type SummaryServiceResult = {
  summary: string;
  detailedSummary: string;
  translatedTitle?: string;
  category?: string;
  tags?: string[];
  qualityScore: number;
  processingTimeMs: number;
  summaryVersion: number;
  critique?: {
    contextComparison: string;
    recommendedAudience: string;
    valueAssessment: string;
    updatedAt: string;
  };
  critiqueVersion?: number;
};

export interface UnifiedSummaryService {
  generateSummary(params: SummaryServiceParams): Promise<SummaryServiceResult>;
}