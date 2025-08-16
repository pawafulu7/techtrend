/**
 * Content Analyzer Module
 * 薄いコンテンツ（Speaker Deckなど）の判定と品質基準の提供
 */

export interface ContentAnalysis {
  isThinContent: boolean;
  contentLength: number;
  recommendedMinLength: number;
  recommendedMaxLength: number;
  sourceName?: string;
}

/**
 * コンテンツを分析して薄いコンテンツかどうかを判定
 * @param content 分析対象のコンテンツ
 * @param sourceName ソース名（オプション）
 * @returns コンテンツ分析結果
 */
export function analyzeContent(
  content: string,
  sourceName?: string
): ContentAnalysis {
  const length = content.length;
  // Speaker Deckは常に薄いコンテンツとして扱う
  // または200文字未満のコンテンツも薄いとみなす
  const isThinContent = sourceName === 'Speaker Deck' || length < 200;
  
  return {
    isThinContent,
    contentLength: length,
    recommendedMinLength: isThinContent ? 60 : 180,
    recommendedMaxLength: isThinContent ? 100 : 300,
    sourceName
  };
}

/**
 * コンテンツの充実度レベルを判定
 * @param content 分析対象のコンテンツ
 * @returns コンテンツレベル文字列
 */
export function getContentLevel(content: string): string {
  const length = content.length;
  if (length < 100) return 'very-thin';
  if (length < 300) return 'thin';
  if (length < 1000) return 'normal';
  return 'rich';
}