/**
 * タグ正規化ユーティリティ
 * すべての要約生成スクリプトで共通のタグ正規化ロジックを提供
 */

// タグ正規化マップ
export const TAG_NORMALIZATION_MAP: Record<string, string> = {
  // JavaScript関連
  'javascript': 'JavaScript',
  'js': 'JavaScript',
  'typescript': 'TypeScript',
  'ts': 'TypeScript',
  'node': 'Node.js',
  'nodejs': 'Node.js',
  'deno': 'Deno',
  
  // フロントエンドフレームワーク
  'react': 'React',
  'vue': 'Vue.js',
  'vuejs': 'Vue.js',
  'angular': 'Angular',
  'svelte': 'Svelte',
  'nextjs': 'Next.js',
  'next': 'Next.js',
  'nuxt': 'Nuxt.js',
  'nuxtjs': 'Nuxt.js',
  
  // バックエンドフレームワーク
  'express': 'Express',
  'fastapi': 'FastAPI',
  'django': 'Django',
  'rails': 'Ruby on Rails',
  'spring': 'Spring Boot',
  
  // プログラミング言語
  'python': 'Python',
  'java': 'Java',
  'go': 'Go',
  'golang': 'Go',
  'rust': 'Rust',
  'ruby': 'Ruby',
  'php': 'PHP',
  'c#': 'C#',
  'csharp': 'C#',
  'cpp': 'C++',
  'c++': 'C++',
  
  // クラウドプラットフォーム
  'aws': 'AWS',
  'gcp': 'GCP',
  'azure': 'Azure',
  'vercel': 'Vercel',
  'netlify': 'Netlify',
  'heroku': 'Heroku',
  
  // コンテナ・オーケストレーション
  'docker': 'Docker',
  'kubernetes': 'Kubernetes',
  'k8s': 'Kubernetes',
  
  // データベース
  'mysql': 'MySQL',
  'postgresql': 'PostgreSQL',
  'postgres': 'PostgreSQL',
  'mongodb': 'MongoDB',
  'redis': 'Redis',
  'sqlite': 'SQLite',
  
  // 開発ツール
  'git': 'Git',
  'github': 'GitHub',
  'gitlab': 'GitLab',
  'vscode': 'VS Code',
  'vim': 'Vim',
  
  // AI/ML関連
  'ai': 'AI',
  'ml': '機械学習',
  'machinelearning': '機械学習',
  'deeplearning': 'ディープラーニング',
  'tensorflow': 'TensorFlow',
  'pytorch': 'PyTorch',
  'openai': 'OpenAI',
  
  // その他の技術
  'graphql': 'GraphQL',
  'rest': 'REST API',
  'api': 'API',
  'websocket': 'WebSocket',
  'microservices': 'マイクロサービス',
  'cicd': 'CI/CD',
  'devops': 'DevOps',
  'agile': 'アジャイル',
  'scrum': 'スクラム',
};

/**
 * タグを正規化する
 * @param tag 正規化前のタグ
 * @returns 正規化後のタグ
 */
export function normalizeTag(tag: string): string {
  const trimmedTag = tag.trim();
  const lowerTag = trimmedTag.toLowerCase();
  
  // マップに存在する場合は正規化されたタグを返す
  if (TAG_NORMALIZATION_MAP[lowerTag]) {
    return TAG_NORMALIZATION_MAP[lowerTag];
  }
  
  // マップに存在しない場合は元のタグを返す（最初の文字を大文字化）
  return trimmedTag.charAt(0).toUpperCase() + trimmedTag.slice(1);
}

/**
 * タグが有効かどうかを検証する
 * @param tag 検証するタグ
 * @returns タグが有効な場合はtrue
 */
export function isValidTag(tag: string): boolean {
  if (!tag || typeof tag !== 'string') {
    return false;
  }
  
  const trimmedTag = tag.trim();
  
  // 空文字列チェック
  if (trimmedTag.length === 0) {
    return false;
  }
  
  // 長さチェック（最小1文字、最大30文字）
  if (trimmedTag.length > 30) {
    return false;
  }
  
  // 一般的すぎるタグを除外
  const genericTags = [
    'プログラミング', 'programming', '開発', 'development', 
    'コンピュータ', 'computer', '技術', 'technology',
    'ソフトウェア', 'software', 'ハードウェア', 'hardware'
  ];
  
  if (genericTags.includes(trimmedTag.toLowerCase())) {
    return false;
  }
  
  return true;
}

/**
 * タグの配列を正規化し、重複を除去する（既存の関数）
 * @param tags 正規化前のタグの配列
 * @returns 正規化後のタグの配列
 */
export function normalizeTags(tags: string[]): string[] {
  const normalizedTags = tags
    .filter(tag => isValidTag(tag))
    .map(tag => normalizeTag(tag));
  
  // 重複を除去
  return [...new Set(normalizedTags)];
}

/**
 * 様々な形式のタグ入力を正規化する（新規追加）
 * 文字列、配列、その他の形式に対応
 * @param input - 文字列、配列、またはその他の形式のタグデータ
 * @returns 正規化されたタグの配列
 */
export function normalizeTagInput(input: unknown): string[] {
  // null/undefinedの場合は空配列を返す
  if (input == null) {
    return [];
  }

  let tags: string[] = [];

  // 文字列の場合はカンマで分割
  if (typeof input === 'string') {
    tags = input
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  }
  // 配列の場合
  else if (Array.isArray(input)) {
    tags = input
      .filter(item => item != null) // null/undefinedを除外
      .map(item => {
        // 各要素が文字列でない場合は文字列に変換
        if (typeof item === 'string') {
          return item.trim();
        } else if (typeof item === 'object' && item !== null && 'name' in item) {
          // オブジェクトでnameプロパティがある場合（タグオブジェクト）
          return String(item.name).trim();
        } else {
          return String(item).trim();
        }
      })
      .filter(tag => tag.length > 0);
  }
  // それ以外の型の場合は空配列を返す
  else {
    return [];
  }

  // 不正なタグを除外（1文字タグ、記号のみなど）
  const validTags = tags.filter(tag => {
    // 1文字のタグは基本的に除外
    if (tag.length === 1) {
      // 数字の1文字は許可（例: "5"はバージョン番号として有効）
      if (/^\d$/.test(tag)) {
        return true;
      }
      // アルファベット1文字は除外
      if (/^[a-zA-Z]$/.test(tag)) {
        return false;
      }
      // 記号のみは除外
      if (/^[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]$/.test(tag)) {
        return false;
      }
    }

    // カンマのみのタグは除外
    if (tag === ',') {
      return false;
    }

    return isValidTag(tag);
  });

  // 既存のnormalizeTagsを使用して正規化と重複除去
  return normalizeTags(validTags);
}

/**
 * タグが有効な配列形式かチェックする
 * @param tags - チェック対象
 * @returns 有効な配列形式の場合true
 */
export function isValidTagArray(tags: unknown): tags is string[] {
  if (!Array.isArray(tags)) {
    return false;
  }

  return tags.every(tag => typeof tag === 'string' && tag.length > 0);
}

/**
 * タグリストを検証し、警告を出力する（デバッグ用）
 * @param tags - 検証対象のタグ
 * @param source - ソース名（ログ出力用）
 * @returns 正規化されたタグ配列
 */
export function validateAndNormalizeTags(tags: unknown, source?: string): string[] {
  const normalized = normalizeTagInput(tags);
  
  // デバッグ用: 元のデータと正規化後のデータが大きく異なる場合は警告
  if (process.env.NODE_ENV !== 'production') {
    if (typeof tags === 'string' && normalized.length === 0 && tags.length > 0) {
    }
    
    if (Array.isArray(tags) && tags.length > 0 && normalized.length === 0) {
    }
  }

  return normalized;
}