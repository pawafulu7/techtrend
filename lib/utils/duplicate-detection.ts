/**
 * 記事の重複検出ユーティリティ
 */

// 日本語の正規化（全角/半角、カタカナ/ひらがなの統一）
function normalizeJapanese(text: string): string {
  // 全角英数字を半角に変換
  let normalized = text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => 
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
  );
  
  // カタカナをひらがなに変換（比較用）
  normalized = normalized.replace(/[\u30A1-\u30FA]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
  
  // 句読点や記号を統一
  normalized = normalized
    .replace(/[「」『』【】〔〕《》〈〉]/g, '')
    .replace(/[・、。！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  
  return normalized;
}

// レーベンシュタイン距離を計算
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // 削除
          dp[i][j - 1] + 1,    // 挿入
          dp[i - 1][j - 1] + 1 // 置換
        );
      }
    }
  }

  return dp[m][n];
}

// タイトルの類似度を計算（0-1の範囲）
export function calculateTitleSimilarity(title1: string, title2: string): number {
  const norm1 = normalizeJapanese(title1);
  const norm2 = normalizeJapanese(title2);
  
  // 完全一致
  if (norm1 === norm2) return 1.0;
  
  // レーベンシュタイン距離ベースの類似度
  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);
  const similarity = 1 - (distance / maxLength);
  
  return Math.max(0, similarity);
}

// 共通キーワードの抽出
function extractKeywords(title: string): Set<string> {
  const normalized = normalizeJapanese(title);
  // 2文字以上の単語を抽出
  const words = normalized.split(/\s+/).filter(word => word.length >= 2);
  return new Set(words);
}

// キーワードベースの類似度
export function calculateKeywordSimilarity(title1: string, title2: string): number {
  const keywords1 = extractKeywords(title1);
  const keywords2 = extractKeywords(title2);
  
  if (keywords1.size === 0 || keywords2.size === 0) return 0;
  
  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const union = new Set([...keywords1, ...keywords2]);
  
  return intersection.size / union.size; // Jaccard係数
}

// 総合的な重複判定
export function isDuplicate(title1: string, title2: string, threshold: number = 0.8): boolean {
  // タイトルの類似度
  const titleSim = calculateTitleSimilarity(title1, title2);
  if (titleSim >= threshold) return true;
  
  // キーワードの類似度（より厳しい閾値）
  const keywordSim = calculateKeywordSimilarity(title1, title2);
  if (keywordSim >= 0.7) return true;
  
  // 特定のパターンチェック
  const patterns = [
    // 「〜について」「〜の話」などの接尾辞を除いて比較
    { pattern: /(について|の話|のこと|に関して)$/, replacement: '' },
    // バージョン番号の違いを無視
    { pattern: /v?\d+(\.\d+)*/, replacement: 'VERSION' },
    // 年月日の違いを無視
    { pattern: /\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日/, replacement: 'DATE' },
  ];
  
  let norm1 = normalizeJapanese(title1);
  let norm2 = normalizeJapanese(title2);
  
  for (const { pattern, replacement } of patterns) {
    norm1 = norm1.replace(pattern, replacement);
    norm2 = norm2.replace(pattern, replacement);
  }
  
  return norm1 === norm2;
}

// 記事グループから重複を除外
export function removeDuplicates<T extends { title: string; publishedAt: Date | string }>(
  articles: T[]
): T[] {
  const result: T[] = [];
  
  for (const article of articles) {
    const isDup = result.some(existing => 
      isDuplicate(existing.title, article.title)
    );
    
    if (!isDup) {
      result.push(article);
    }
  }
  
  // 公開日時でソート（新しい順）
  return result.sort((a, b) => {
    const dateA = new Date(a.publishedAt).getTime();
    const dateB = new Date(b.publishedAt).getTime();
    return dateB - dateA;
  });
}