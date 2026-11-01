// タグカテゴリ定義
export interface TagCategory {
  name: string;
  keywords: string[];
}

// カテゴリと判定キーワードの定義
export const TAG_CATEGORIES: TagCategory[] = [
  { 
    name: 'languages', 
    keywords: [
      'javascript', 'typescript', 'python', 'go', 'golang', 'rust', 
      'java', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 
      'scala', 'r', 'matlab', 'perl', 'lua', 'dart', 'elixir',
      'haskell', 'clojure', 'erlang', 'f#', 'ocaml', 'nim'
    ] 
  },
  { 
    name: 'frameworks', 
    keywords: [
      'react', 'vue', 'angular', 'next.js', 'nextjs', 'nuxt', 'nuxtjs',
      'gatsby', 'svelte', 'django', 'flask', 'rails', 'ruby on rails',
      'express', 'fastapi', 'spring', 'laravel', 'symfony', 'asp.net',
      'gin', 'echo', 'fiber', 'actix', 'rocket', 'phoenix', 'nest.js',
      'nestjs', 'strapi', 'remix', 'astro', 'qwik'
    ] 
  },
  { 
    name: 'tools', 
    keywords: [
      'docker', 'kubernetes', 'k8s', 'git', 'github', 'gitlab', 
      'webpack', 'vite', 'rollup', 'parcel', 'esbuild', 'turbopack',
      'npm', 'yarn', 'pnpm', 'pip', 'poetry', 'cargo', 'maven', 
      'gradle', 'jenkins', 'circleci', 'travis', 'github actions',
      'terraform', 'ansible', 'puppet', 'chef', 'vagrant', 'prometheus',
      'grafana', 'elasticsearch', 'kibana', 'logstash', 'redis', 
      'nginx', 'apache', 'caddy', 'pm2', 'forever', 'nodemon'
    ] 
  },
  { 
    name: 'concepts', 
    keywords: [
      'アルゴリズム', 'algorithm', 'デザインパターン', 'design pattern',
      'セキュリティ', 'security', 'パフォーマンス', 'performance',
      'テスト', 'testing', 'test', 'tdd', 'bdd', 'ci/cd', 'devops',
      'agile', 'scrum', 'solid', 'dry', 'kiss', 'yagni', 'clean code',
      'refactoring', 'リファクタリング', 'アーキテクチャ', 'architecture',
      'マイクロサービス', 'microservices', 'api', 'rest', 'graphql',
      'websocket', 'grpc', 'oauth', 'jwt', 'encryption', '暗号化'
    ] 
  },
  { 
    name: 'platforms', 
    keywords: [
      'aws', 'amazon web services', 'gcp', 'google cloud', 'azure',
      'vercel', 'netlify', 'heroku', 'digitalocean', 'linode',
      'cloudflare', 'firebase', 'supabase', 'planetscale', 'railway',
      'fly.io', 'render', 'amplify', 'github pages', 'gitlab pages',
      'kubernetes', 'openshift', 'cloud foundry', 'alibaba cloud',
      'oracle cloud', 'ibm cloud'
    ] 
  },
  {
    name: 'databases',
    keywords: [
      'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'sqlite',
      'mariadb', 'oracle', 'sql server', 'dynamodb', 'cassandra',
      'elasticsearch', 'neo4j', 'influxdb', 'couchdb', 'firestore',
      'fauna', 'cockroachdb', 'timescaledb', 'clickhouse', 'prisma',
      'typeorm', 'sequelize', 'mongoose', 'drizzle'
    ]
  },
  {
    name: 'mobile',
    keywords: [
      'react native', 'flutter', 'swift', 'swiftui', 'kotlin',
      'android', 'ios', 'xamarin', 'ionic', 'cordova', 'capacitor',
      'expo', 'nativescript', 'pwa', 'progressive web app',
      'mobile', 'モバイル', 'スマートフォン', 'smartphone'
    ]
  },
  {
    name: 'ai-ml',
    keywords: [
      'ai', '人工知能', 'artificial intelligence', 'ml', '機械学習',
      'machine learning', 'deep learning', '深層学習', 'tensorflow',
      'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy', 'jupyter',
      'chatgpt', 'gpt', 'llm', 'nlp', '自然言語処理', 'computer vision',
      'コンピュータビジョン', 'neural network', 'ニューラルネットワーク'
    ]
  }
];

/**
 * タグ名からカテゴリを判定する
 * @param tagName タグ名
 * @returns カテゴリ名（該当なしの場合はnull）
 */
export function categorizeTag(tagName: string): string | null {
  const normalizedTag = tagName.toLowerCase().trim();
  
  // 空文字列のチェック
  if (!normalizedTag) {
    return null;
  }
  
  for (const category of TAG_CATEGORIES) {
    // 完全一致または部分一致でチェック
    if (category.keywords.some(keyword => {
      const normalizedKeyword = keyword.toLowerCase();
      
      // 完全一致
      if (normalizedTag === normalizedKeyword) return true;
      
      // ハイフンやドットを含むタグの柔軟な判定
      if (normalizedTag.replace(/[-._]/g, '') === normalizedKeyword.replace(/[-._]/g, '')) return true;
      
      // 部分一致（3文字以下のキーワードは除外）
      if (normalizedKeyword.length > 3) {
        // タグがキーワードを含む、またはキーワードがタグを含む
        if (normalizedTag.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedTag)) return true;
      }
      
      return false;
    })) {
      return category.name;
    }
  }
  
  return null;
}

/**
 * 複数のタグからカテゴリごとに分類する
 * @param tagNames タグ名の配列
 * @returns カテゴリ名をキーとしたタグの分類結果
 */
export function categorizeMultipleTags(tagNames: string[]): Record<string, string[]> {
  const categorized: Record<string, string[]> = {};
  const uncategorized: string[] = [];
  
  for (const tagName of tagNames) {
    const category = categorizeTag(tagName);
    if (category) {
      if (!categorized[category]) {
        categorized[category] = [];
      }
      categorized[category].push(tagName);
    } else {
      uncategorized.push(tagName);
    }
  }
  
  if (uncategorized.length > 0) {
    categorized['uncategorized'] = uncategorized;
  }
  
  return categorized;
}

/**
 * タグの統計情報を取得
 * @param tagNames タグ名の配列
 * @returns カテゴリごとの統計情報
 */
export function getTagStatistics(tagNames: string[]): Record<string, number> {
  const stats: Record<string, number> = {};
  
  for (const tagName of tagNames) {
    const category = categorizeTag(tagName) || 'uncategorized';
    stats[category] = (stats[category] || 0) + 1;
  }
  
  return stats;
}