export type SummaryServiceParams = {
  title: string;
  content: string;
  url?: string;
  articleType?: 'technical' | 'news' | 'tutorial' | 'opinion';
  qualityThreshold?: number;
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
};

export interface UnifiedSummaryService {
  generateSummary(params: SummaryServiceParams): Promise<SummaryServiceResult>;
  /**
   * 記事の埋め込みのジョブを積む。要約を DB に保存した後に呼ぶ（ワーカーは保存済みの要約を埋め込むので、
   * 保存より先に積むと、要約の無い記事のジョブは失敗し、作り直した記事には古い要約が埋め込まれる）。
   * 積むのに失敗しても例外は投げない（要約の保存は成功のまま）
   */
  scheduleEmbedding(articleId: string): Promise<void>;
}
