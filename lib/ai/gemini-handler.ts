import { postProcessSummaries } from '../utils/summary-post-processor';
import { getUnifiedSummaryService } from './unified-summary-service';

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType: string;
}

export async function generateSummaryAndTags(
  title: string,
  content: string
): Promise<SummaryAndTags> {
  // 統一サービスを使用
  const service = getUnifiedSummaryService();
  
  try {
    const result = await service.generate(title, content, {
      maxRetries: 3,
      minQualityScore: 40
    });
    
    // 後処理を適用して文字数制約と句点を調整
    const processed = postProcessSummaries(result.summary, result.detailedSummary);
    
    return {
      summary: processed.summary,
      detailedSummary: processed.detailedSummary,
      tags: result.tags,
      articleType: result.articleType
    };
  } catch (_error) {
    throw _error;
  }
}