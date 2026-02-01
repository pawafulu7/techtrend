/**
 * URL正規化ユーティリティ
 * クロスポスト記事の重複検知のためにURLを正規化
 */

// 除去するパラメータ一覧
const TRACKING_PARAMS = [
  // UTMパラメータ
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  // その他の追跡パラメータ
  'source',
  'ref',
  'ref_src',
  'ref_url',
  'referrer',
  // SNS関連
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  // Medium/Hashnode特有
  'gi',
  'sk',
  // 汎用
  '_ga',
  '_gid',
  'hsCtaTracking',
];

/**
 * URLを正規化してトラッキングパラメータを除去
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // 1. トラッキングパラメータを除去
    TRACKING_PARAMS.forEach((param) => {
      parsed.searchParams.delete(param);
    });

    // 2. ハッシュフラグメントを除去（アンカーリンク）
    parsed.hash = '';

    // 3. 末尾スラッシュの正規化（パスがある場合のみ除去）
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    // 4. wwwの有無を統一（wwwなしに）
    if (parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4);
    }

    // 5. HTTPSに統一
    parsed.protocol = 'https:';

    // 6. ポート番号を除去（デフォルトポートの場合）
    if (parsed.port === '443' || parsed.port === '80') {
      parsed.port = '';
    }

    // 7. 空のクエリ文字列を除去
    if (parsed.search === '?') {
      parsed.search = '';
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * タイトルの正規化（重複検知用）
 * - 記号や余分な空白を除去
 * - 小文字に統一
 */
export function normalizeTitle(title: string): string {
  return (
    title
      .toLowerCase()
      // 日本語の括弧も含めてスペースに変換
      .replace(/[\[\]【】「」『』（）()]/g, ' ')
      // 記号を空白に
      .replace(/[:\-–—|・]/g, ' ')
      // 連続する空白を1つに
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * レーベンシュタイン距離を計算
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * レーベンシュタイン距離ベースの類似度計算
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * 2つの記事が重複しているかを判定
 * @param existingUrl 既存記事のURL
 * @param existingTitle 既存記事のタイトル
 * @param newUrl 新規記事のURL
 * @param newTitle 新規記事のタイトル
 * @param similarityThreshold 類似度の閾値（デフォルト0.85）
 * @returns 重複している場合true
 */
export function isArticleDuplicate(
  existingUrl: string,
  existingTitle: string,
  newUrl: string,
  newTitle: string,
  similarityThreshold: number = 0.85
): boolean {
  // 1. URL正規化後の完全一致
  if (existingUrl && newUrl) {
    const normalizedExistingUrl = normalizeUrl(existingUrl);
    const normalizedNewUrl = normalizeUrl(newUrl);
    if (normalizedExistingUrl === normalizedNewUrl) {
      return true;
    }
  }

  // 2. タイトル正規化後の類似度チェック
  // null/undefined チェック
  if (!existingTitle || !newTitle) {
    return false;
  }

  const normalizedExistingTitle = normalizeTitle(existingTitle);
  const normalizedNewTitle = normalizeTitle(newTitle);

  // 空のタイトルは比較しない
  if (!normalizedExistingTitle || !normalizedNewTitle) {
    return false;
  }

  // 完全一致
  if (normalizedExistingTitle === normalizedNewTitle) {
    return true;
  }

  // 類似度チェック
  return (
    calculateSimilarity(normalizedExistingTitle, normalizedNewTitle) >=
    similarityThreshold
  );
}
