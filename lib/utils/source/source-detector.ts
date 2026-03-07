/**
 * URLからソースを自動判定するユーティリティ
 */

export interface SourceDetectionResult {
  source: string;
  confidence: 'high' | 'medium' | 'low';
  pattern: string;
}

/**
 * URLパターンとソースのマッピング
 */
const SOURCE_PATTERNS: { regex: RegExp; source: string; pattern: string }[] = [
  { regex: /speakerdeck\.com/i, source: 'Speaker Deck', pattern: 'speakerdeck.com' },
  { regex: /qiita\.com/i, source: 'Qiita', pattern: 'qiita.com' },
  { regex: /zenn\.dev/i, source: 'Zenn', pattern: 'zenn.dev' },
  { regex: /dev\.to/i, source: 'Dev.to', pattern: 'dev.to' },
  { regex: /medium\.com|medium\./i, source: 'Medium', pattern: 'medium.com' },
  { regex: /hatena\.ne\.jp|hatenablog/i, source: 'Hatena', pattern: 'hatena' },
  { regex: /github\.com.*\/blog/i, source: 'GitHub Blog', pattern: 'github.com/blog' },
  { regex: /stackoverflow\.blog/i, source: 'Stack Overflow Blog', pattern: 'stackoverflow.blog' },
  { regex: /aws\.amazon\.com.*\/blogs/i, source: 'AWS Blog', pattern: 'aws.amazon.com/blogs' },
  { regex: /cloud\.google\.com.*\/blog/i, source: 'Google Cloud Blog', pattern: 'cloud.google.com/blog' },
  { regex: /developers\.google\.com/i, source: 'Google Developers Blog', pattern: 'developers.google.com' },
  { regex: /blog\.google/i, source: 'Google AI Blog', pattern: 'blog.google' },
  { regex: /huggingface\.co/i, source: 'Hugging Face', pattern: 'huggingface.co' },
  { regex: /infoq\.com/i, source: 'InfoQ', pattern: 'infoq.com' },
  { regex: /publickey1\.jp/i, source: 'Publickey', pattern: 'publickey1.jp' },
  { regex: /thinkit\.co\.jp/i, source: 'Think IT', pattern: 'thinkit.co.jp' },
  { regex: /note\.com/i, source: 'Note', pattern: 'note.com' },
  { regex: /techblog\.|tech\..*\.com|engineering\./i, source: 'Corporate Tech Blog', pattern: 'techblog' },
];

/**
 * URLからソースを検出する
 * @param url 検出対象のURL
 * @returns 検出結果
 */
export function detectSourceFromUrl(url: string): SourceDetectionResult {
  if (!url) {
    return {
      source: 'Manual',
      confidence: 'low',
      pattern: 'unknown'
    };
  }

  // URLの正規化
  const normalizedUrl = url.toLowerCase().trim();

  // パターンマッチング
  for (const { regex, source, pattern } of SOURCE_PATTERNS) {
    if (regex.test(normalizedUrl)) {
      return {
        source,
        confidence: 'high',
        pattern
      };
    }
  }

  // 企業技術ブログの追加チェック（日本企業）
  const japaneseTechBlogs = [
    { keyword: 'cybozu', source: 'Cybozu Tech Blog' },
    { keyword: 'mercari', source: 'Mercari Engineering Blog' },
    { keyword: 'line', source: 'LINE Engineering Blog' },
    { keyword: 'dena', source: 'DeNA Tech Blog' },
    { keyword: 'rakuten', source: 'Rakuten Tech Blog' },
    { keyword: 'yahoo', source: 'Yahoo Tech Blog' },
    { keyword: 'cookpad', source: 'Cookpad Tech Blog' },
    { keyword: 'freee', source: 'freee Tech Blog' },
    { keyword: 'moneyforward', source: 'Money Forward Tech Blog' },
    { keyword: 'smarthr', source: 'SmartHR Tech Blog' },
  ];

  for (const { keyword, source } of japaneseTechBlogs) {
    if (normalizedUrl.includes(keyword)) {
      return {
        source,
        confidence: 'medium',
        pattern: keyword
      };
    }
  }

  // デフォルト: Manual（手動追加）
  return {
    source: 'Manual',
    confidence: 'low',
    pattern: 'unknown'
  };
}

/**
 * ソース名の正規化（データベース用）
 * @param source ソース名
 * @returns 正規化されたソース名
 */
export function normalizeSourceName(source: string): string {
  // 既知のソース名の正規化マッピング
  const normalizations: Record<string, string> = {
    'Speaker Deck': 'Speaker Deck',
    'Qiita': 'Qiita',
    'Zenn': 'Zenn',
    'Dev.to': 'Dev.to',
    'Hatena': 'Hatena Bookmark',
    'Medium': 'Medium',
    'Manual': 'Manual Entry',
    'Corporate Tech Blog': 'Corporate Tech Blog',
  };

  return normalizations[source] || source;
}

/**
 * URLが対応しているかチェック
 * @param url チェック対象のURL
 * @returns 対応している場合はtrue
 */
export function isSupportedUrl(url: string): boolean {
  const result = detectSourceFromUrl(url);
  return result.confidence === 'high' || result.confidence === 'medium';
}

/**
 * URLバリデーション
 * @param url 検証対象のURL
 * @returns 有効なURLの場合はtrue
 */
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}