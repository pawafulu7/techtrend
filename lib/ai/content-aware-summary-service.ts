/**
 * コンテンツ長を考慮した要約生成サービス
 */

import { UnifiedSummaryService, UnifiedSummaryResult, GenerateOptions } from './unified-summary-service';
import { checkSummaryQuality } from '../utils/summary-quality-checker';

/**
 * コンテンツの分類
 */
export enum ContentCategory {
  VERY_SHORT = 'very_short',  // < 200文字
  SHORT = 'short',            // 200-500文字
  MEDIUM = 'medium',          // 500-1000文字
  LONG = 'long'              // 1000文字以上
}

/**
 * コンテンツ長に応じた設定
 */
interface ContentLengthConfig {
  category: ContentCategory;
  generateDetailed: boolean;
  targetItems: number;
  minLength: number;
  maxLength: number;
  fallbackMessage?: string;
}

/**
 * コンテンツ長別の設定
 */
const CONTENT_LENGTH_CONFIGS: ContentLengthConfig[] = [
  {
    category: ContentCategory.VERY_SHORT,
    generateDetailed: false,
    targetItems: 0,
    minLength: 0,
    maxLength: 199,
    fallbackMessage: 'この記事は内容が限定的なため、詳細な要約を提供できません。元記事をご確認ください。'
  },
  {
    category: ContentCategory.SHORT,
    generateDetailed: true,
    targetItems: 2,  // 2-3項目
    minLength: 200,
    maxLength: 499
  },
  {
    category: ContentCategory.MEDIUM,
    generateDetailed: true,
    targetItems: 3,  // 3-4項目
    minLength: 500,
    maxLength: 999
  },
  {
    category: ContentCategory.LONG,
    generateDetailed: true,
    targetItems: 5,  // 5項目（通常）
    minLength: 1000,
    maxLength: Number.MAX_SAFE_INTEGER
  }
];

/**
 * コンテンツ長を考慮した要約生成サービス
 */
export class ContentAwareSummaryService extends UnifiedSummaryService {
  
  /**
   * コンテンツのカテゴリを判定
   */
  private categorizeContent(content: string): ContentLengthConfig {
    const length = content?.length || 0;
    
    for (const config of CONTENT_LENGTH_CONFIGS) {
      if (length >= config.minLength && length <= config.maxLength) {
        return config;
      }
    }
    
    // デフォルトはLONG
    return CONTENT_LENGTH_CONFIGS[CONTENT_LENGTH_CONFIGS.length - 1];
  }
  
  /**
   * 簡略版のプロンプトを生成
   */
  private generateShortContentPrompt(title: string, content: string, targetItems: number): string {
    return `
技術記事を分析して、以下の形式で要約を作成してください。

【注意事項】
- この記事はコンテンツが限定的です（${content.length}文字）
- 実際に記載されている内容のみを要約してください
- 推測や憶測は避けてください
- 詳細要約は最大${targetItems}項目まで

要約:
【必須】60文字以上130文字以下で記述。記事の核心的内容を説明。最後は必ず句点で終了。

詳細要約:
【必須】${targetItems}項目以内で箇条書き。各項目は100-150文字程度。
利用可能な情報に基づいて記述。項目の最後に句点なし。
【重要】箇条書きは必ず「・」（中黒）を使用すること。

タグ:
技術名を3個まで（カンマ区切り）

タイトル: ${title}
内容: ${content}
`;
  }
  
  /**
   * 要約生成（コンテンツ長を考慮）
   */
  async generate(
    title: string,
    content: string,
    options?: GenerateOptions,
    sourceInfo?: { sourceName?: string, url?: string }
  ): Promise<UnifiedSummaryResult> {
    const config = this.categorizeContent(content);
    
    
    // 非常に短いコンテンツの場合
    if (!config.generateDetailed) {
      return {
        summary: `${title.substring(0, 100)}に関する記事です。`,
        detailedSummary: config.fallbackMessage || '',
        tags: [],
        articleType: 'unified',
        summaryVersion: this.getSummaryVersion(),
        qualityScore: 0
      };
    }
    
    // 短いコンテンツ用の処理
    if (config.category === ContentCategory.SHORT || config.category === ContentCategory.MEDIUM) {
      const prompt = this.generateShortContentPrompt(title, content, config.targetItems);
      
      try {
        // 親クラスのcallGeminiAPIメソッドを使用
        const responseText = await (this as unknown).callGeminiAPI(prompt);
        const parsed = await this.parseAndValidateResponse(responseText, config.targetItems);
        
        return {
          ...parsed,
          articleType: 'unified',
          summaryVersion: this.getSummaryVersion(),
          qualityScore: checkSummaryQuality(parsed.summary, parsed.detailedSummary).score
        };
      } catch (_error) {
        // フォールバック
        return {
          summary: `${title.substring(0, 100)}に関する技術記事です。`,
          detailedSummary: `・${content.substring(0, 150)}`,
          tags: [],
          articleType: 'unified',
          summaryVersion: this.getSummaryVersion(),
          qualityScore: 0
        };
      }
    }
    
    // 通常のコンテンツは親クラスの処理を使用
    return super.generate(title, content, options, sourceInfo);
  }
  
  /**
   * レスポンスのパースと検証（項目数チェック付き）
   */
  private async parseAndValidateResponse(responseText: string, maxItems: number): Promise<{
    summary: string;
    detailedSummary: string;
    tags: string[];
  }> {
    const lines = responseText.split('\n');
    let summary = '';
    let detailedSummary = '';
    let tags: string[] = [];
    let isDetailedSection = false;
    let itemCount = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('要約:') || trimmed.startsWith('一覧要約:')) {
        isDetailedSection = false;
        const content = trimmed.replace(/^(一覧)?要約[:：]\s*/, '').trim();
        if (content) {
          summary = content;
        }
      } else if (trimmed.startsWith('詳細要約:')) {
        isDetailedSection = true;
        const content = trimmed.replace(/^詳細要約[:：]\s*/, '').trim();
        if (content && content.startsWith('・')) {
          detailedSummary = content;
          itemCount = 1;
        }
      } else if (trimmed.startsWith('タグ:')) {
        isDetailedSection = false;
        const tagLine = trimmed.replace(/^タグ[:：]\s*/, '').trim();
        tags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0 && tag.length <= 30)
          .slice(0, 5);
      } else if (isDetailedSection && trimmed.startsWith('・')) {
        if (itemCount < maxItems) {
          if (detailedSummary) {
            detailedSummary += '\n' + trimmed;
          } else {
            detailedSummary = trimmed;
          }
          itemCount++;
        }
      }
    }
    
    // 後処理
    const { postProcessSummaries } = await import('../utils/summary-post-processor');
    const processed = postProcessSummaries(summary, detailedSummary);
    
    return {
      summary: processed.summary || '要約を生成できませんでした。',
      detailedSummary: processed.detailedSummary || '詳細要約を生成できませんでした。',
      tags: tags
    };
  }
}

/**
 * シングルトンインスタンスを取得
 */
export function getContentAwareSummaryService(): ContentAwareSummaryService {
  return new ContentAwareSummaryService();
}