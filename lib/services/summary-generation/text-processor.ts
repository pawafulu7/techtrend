/**
 * テキスト処理ユーティリティ
 * 要約生成時のテキストクリーンアップと正規化
 */

/**
 * 基本的なテキストクリーンアップ
 * @param text クリーンアップ対象のテキスト
 * @returns クリーンアップされたテキスト
 */
export function cleanupText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/\n/g, ' ')                // すべての改行をスペースに変換
    .replace(/\s{3,}/g, ' ')            // 3つ以上のスペースを1つに
    .replace(/[・•]\s*/g, '・')         // 中点の統一
    .replace(/：/g, ':')                // 全角コロンを半角に
    .replace(/（/g, '(')                // 全角括弧を半角に
    .replace(/）/g, ')')
    .replace(/\s*。\s*/g, '。')         // 句点前後の空白を削除
    .replace(/。{2,}/g, '。')           // 重複する句点を削除
    .replace(/\s+/g, ' ')               // 連続するスペースを1つに
    .trim();
}

/**
 * 最終的なクリーンアップ（句点追加など）
 * @param text クリーンアップ対象のテキスト
 * @returns 最終的にクリーンアップされたテキスト
 */
export function finalCleanup(text: string): string {
  if (!text) return '';
  
  let cleaned = cleanupText(text);
  
  // 句点で終わっていない場合は追加
  if (cleaned && !cleaned.endsWith('。')) {
    cleaned += '。';
  }
  
  return cleaned;
}

/**
 * 詳細要約の正規化
 * 箇条書きや改行の整形
 * @param text 詳細要約テキスト
 * @returns 正規化された詳細要約
 */
export function normalizeDetailedSummary(text: string): string {
  if (!text) return '';
  
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // 箇条書きマーカーの正規化
      if (line.match(/^[-・•*]/)) {
        return line.replace(/^[-・•*]\s*/, '・');
      }
      // 番号付きリストの正規化
      if (line.match(/^\d+[.)]/)) {
        return line.replace(/^(\d+)[.)]/, '$1.');
      }
      return line;
    })
    .join('\n');
}

/**
 * HTMLタグの除去
 * @param text HTMLを含む可能性のあるテキスト
 * @returns HTMLタグを除去したテキスト
 */
export function stripHtmlTags(text: string): string {
  if (!text) return '';

  return text
    .replace(/<[^>]*>/g, '')           // HTMLタグを除去
    .replace(/&nbsp;/g, ' ')           // &nbsp;をスペースに
    .replace(/&lt;/g, '<')             // &lt;を<に
    .replace(/&gt;/g, '>')             // &gt;を>に
    .replace(/&quot;/g, '"')           // &quot;を"に
    .replace(/&#39;/g, "'")            // &#39;を'に
    .replace(/&amp;/g, '&')            // &amp;を&に（最後に処理）
    .trim();
}

/**
 * 文字数制限付きトリミング
 * @param text トリミング対象のテキスト
 * @param maxLength 最大文字数
 * @param suffix 省略時の接尾辞
 * @returns トリミングされたテキスト
 */
export function truncateText(
  text: string, 
  maxLength: number, 
  suffix: string = '...'
): string {
  if (!text || text.length <= maxLength) return text;
  
  // Unicode文字を考慮した文字数計算
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  
  const suffixChars = Array.from(suffix);
  const trimmedLength = maxLength - suffixChars.length;
  
  if (trimmedLength <= 0) return suffix;
  
  const trimmed = chars.slice(0, trimmedLength).join('');
  
  // 文の途中で切れないように調整
  const lastSentenceEnd = Math.max(
    trimmed.lastIndexOf('。'),
    trimmed.lastIndexOf('、'),
    trimmed.lastIndexOf(' ')
  );
  
  if (lastSentenceEnd > trimmedLength * 0.8) {
    return text.substring(0, lastSentenceEnd) + suffix;
  }
  
  return trimmed + suffix;
}