/**
 * タグ解析・処理ユーティリティ
 * AI生成結果からのタグ抽出と正規化
 */

/**
 * タグ抽出結果の型定義
 */
export interface ParsedTags {
  tags: string[];
  cleanedText: string;
}

/**
 * AI応答からタグを抽出
 * @param response AI応答テキスト
 * @returns 抽出されたタグとクリーンなテキスト
 */
export function parseSummaryAndTags(response: string): ParsedTags {
  const lines = response.split('\n');
  const tags: string[] = [];
  const summaryLines: string[] = [];
  let isTagSection = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // タグセクションの開始を検出
    if (trimmedLine.toLowerCase().includes('タグ:') || 
        trimmedLine.toLowerCase().includes('tags:') ||
        trimmedLine.startsWith('#')) {
      isTagSection = true;
      
      // 同じ行にタグが含まれている場合
      const tagMatch = trimmedLine.match(/[:#]\s*(.+)/);
      if (tagMatch) {
        const tagString = tagMatch[1];
        tags.push(...extractTagsFromString(tagString));
      }
      continue;
    }
    
    // タグセクション内の処理
    if (isTagSection && trimmedLine) {
      // タグリストの終了を検出
      if (!trimmedLine.startsWith('-') && 
          !trimmedLine.startsWith('・') &&
          !trimmedLine.startsWith('*') &&
          !trimmedLine.match(/^\d+[.)]/) &&
          !trimmedLine.includes(',')) {
        isTagSection = false;
        summaryLines.push(line);
      } else {
        tags.push(...extractTagsFromString(trimmedLine));
      }
    } else if (!isTagSection) {
      summaryLines.push(line);
    }
  }
  
  return {
    tags: normalizeTags(tags),
    cleanedText: summaryLines.join('\n').trim()
  };
}

/**
 * 文字列からタグを抽出
 * @param text タグを含む文字列
 * @returns 抽出されたタグの配列
 */
function extractTagsFromString(text: string): string[] {
  // リストマーカーを除去
  let cleaned = text.replace(/^[-・•*]\s*/, '');
  cleaned = cleaned.replace(/^\d+[.)]\s*/, '');
  
  // カンマまたはスペースで分割
  const tags = cleaned.split(/[,、\s]+/)
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
    .filter(tag => !tag.includes(':'))
    .filter(tag => tag.length < 50); // 異常に長いタグを除外
  
  return tags;
}

/**
 * タグの正規化
 * @param tags 正規化前のタグ配列
 * @returns 正規化されたタグ配列
 */
function normalizeTags(tags: string[]): string[] {
  const normalized = tags
    .map(tag => normalizeTag(tag))
    .filter(tag => tag.length > 0)
    .filter((tag, index, self) => self.indexOf(tag) === index); // 重複除去
  
  return normalized.slice(0, 10); // 最大10個まで
}

/**
 * 単一タグの正規化
 * @param tag 正規化前のタグ
 * @returns 正規化されたタグ
 */
function normalizeTag(tag: string): string {
  return tag
    .replace(/^["'「」]/g, '')        // 引用符を除去
    .replace(/["'「」]$/g, '')
    .replace(/[#＃]/g, '')            // ハッシュ記号を除去
    .replace(/\s+/g, ' ')              // 複数スペースを単一に
    .trim();
}

/**
 * タグの妥当性チェック
 * @param tag チェック対象のタグ
 * @returns 妥当なタグかどうか
 */
export function isValidTag(tag: string): boolean {
  if (!tag || tag.length < 2) return false;
  if (tag.length > 50) return false;
  if (tag.match(/^[0-9]+$/)) return false; // 数字のみは除外
  if (tag.match(/^[.,!?;:]+$/)) return false; // 記号のみは除外
  
  return true;
}

/**
 * タグのカテゴリ分類
 * @param tags タグの配列
 * @returns カテゴリ別に分類されたタグ
 */
export function categorizeTags(tags: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    language: [],
    framework: [],
    tool: [],
    concept: [],
    other: []
  };
  
  const languagePatterns = /^(JavaScript|TypeScript|Python|Java|Go|Ruby|PHP|C\+\+|C#|Swift|Kotlin|Rust)/i;
  const frameworkPatterns = /^(React|Vue|Angular|Next\.js|Nuxt|Express|Django|Rails|Spring|Laravel)/i;
  const toolPatterns = /^(Docker|Kubernetes|Git|GitHub|AWS|Azure|GCP|Jenkins|CircleCI)/i;
  const conceptPatterns = /^(AI|機械学習|深層学習|API|REST|GraphQL|マイクロサービス|DevOps)/i;
  
  for (const tag of tags) {
    if (languagePatterns.test(tag)) {
      categories.language.push(tag);
    } else if (frameworkPatterns.test(tag)) {
      categories.framework.push(tag);
    } else if (toolPatterns.test(tag)) {
      categories.tool.push(tag);
    } else if (conceptPatterns.test(tag)) {
      categories.concept.push(tag);
    } else {
      categories.other.push(tag);
    }
  }
  
  return categories;
}