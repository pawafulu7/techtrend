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
 * タグの配列を正規化し、重複を除去する
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