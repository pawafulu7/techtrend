export type DetailPolicy = 'short' | 'medium' | 'long';

export type SummaryProviderInput = {
  title: string;
  content: string;
  articleType?: 'technical' | 'news' | 'tutorial' | 'opinion';
  tone?: 'formal' | 'casual';
  constraints: {
    maxHeadlineChars: number;
    detailPolicy: DetailPolicy;
  };
  requestId: string;
};

export type SummaryProviderOutput = {
  headline: string;
  detailedSummary: string;
  translatedTitle?: string;
  category?: string;
  tags?: string[];
  confidence: number;
  rawResponse?: Record<string, unknown>;
};

export interface SummaryProvider {
  summarize(input: SummaryProviderInput): Promise<SummaryProviderOutput>;
}