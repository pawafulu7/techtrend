import { Tag, ArticleCategory } from '@prisma/client';

// カテゴリとタグのマッピング（Enumのアンダースコア形式に対応）
export const CATEGORY_MAPPINGS = {
  'frontend': ['React', 'Vue', 'Angular', 'CSS', 'JavaScript', 'TypeScript', 'Next.js', 'Nuxt', 'Svelte', 'HTML', 'Tailwind', 'Material-UI', 'Chakra UI'],
  'backend': ['Node.js', 'Python', 'Ruby', 'Go', 'Java', 'PHP', 'Rails', 'Django', 'Express', 'FastAPI', 'Spring', 'Laravel', 'ASP.NET', 'Rust'],
  'ai_ml': ['AI', 'LLM', '機械学習', 'Claude', 'GPT', 'Gemini', 'ChatGPT', 'OpenAI', '深層学習', 'TensorFlow', 'PyTorch', 'Hugging Face', 'Copilot'],
  'security': ['セキュリティ', 'Security', '脆弱性', 'CVE', 'XSS', 'CSRF', 'OWASP', '認証', 'OAuth', 'JWT', 'encryption', 'SSL', 'TLS'],
  'devops': ['Docker', 'Kubernetes', 'CI/CD', 'AWS', 'GCP', 'Azure', 'Jenkins', 'GitHub Actions', 'Terraform', 'Ansible', 'CloudFormation', 'Vercel', 'Netlify'],
  'database': ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQL', 'NoSQL', 'DynamoDB', 'Firestore', 'Supabase', 'Prisma', 'TypeORM', 'Sequelize'],
  'mobile': ['iOS', 'Android', 'Flutter', 'React Native', 'Swift', 'Kotlin', 'Expo', 'SwiftUI', 'Jetpack Compose', 'Xamarin'],
  'web3': ['Blockchain', 'Web3', 'Ethereum', 'Solidity', 'NFT', 'DeFi', 'Smart Contract', 'Crypto', 'Bitcoin', 'Polygon'],
  'design': ['UI', 'UX', 'Figma', 'Design', 'デザイン', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator'],
  'testing': ['Test', 'テスト', 'Jest', 'Cypress', 'Playwright', 'Testing Library', 'Mocha', 'Jasmine', 'QA', 'E2E'],
  'performance': ['Performance', 'パフォーマンス', '最適化', 'Optimization', 'Speed', 'Cache', 'CDN', 'Lighthouse'],
  'architecture': ['Architecture', 'アーキテクチャ', 'Microservices', 'Serverless', 'Domain Driven', 'Clean Architecture', 'SOLID', 'Design Pattern']
} as const;

export type Category = keyof typeof CATEGORY_MAPPINGS;

export class CategoryClassifier {
  /**
   * タグリストから最も適切なカテゴリを判定
   */
  static classifyByTags(tags: Tag[] | { name: string }[]): ArticleCategory | null {
    if (!tags || tags.length === 0) {
      return null;
    }

    const tagNames = tags.map(tag => tag.name.toLowerCase());
    const categoryScores: Record<string, number> = {};

    // 各カテゴリのスコアを計算
    for (const [category, categoryTags] of Object.entries(CATEGORY_MAPPINGS)) {
      let score = 0;
      
      for (const categoryTag of categoryTags) {
        const lowerCategoryTag = categoryTag.toLowerCase();
        
        // 完全一致: 3点
        if (tagNames.includes(lowerCategoryTag)) {
          score += 3;
        }
        // 部分一致: 1点
        else if (tagNames.some(tag => tag.includes(lowerCategoryTag) || lowerCategoryTag.includes(tag))) {
          score += 1;
        }
      }

      if (score > 0) {
        categoryScores[category] = score;
      }
    }

    // スコアが最も高いカテゴリを返す
    const entries = Object.entries(categoryScores);
    if (entries.length === 0) {
      return null;
    }

    const [topCategory] = entries.sort((a, b) => b[1] - a[1]);
    return topCategory[0] as ArticleCategory;
  }

  /**
   * タイトルとコンテンツからカテゴリを推定（補助的）
   */
  static classifyByContent(title: string, content?: string | null): ArticleCategory | null {
    const categoryScores: Record<string, number> = {};

    for (const [category, categoryTags] of Object.entries(CATEGORY_MAPPINGS)) {
      let score = 0;
      
      for (const categoryTag of categoryTags) {
        const lowerTag = categoryTag.toLowerCase();
        
        // タイトル内での出現: 2点
        if (title.toLowerCase().includes(lowerTag)) {
          score += 2;
        }
        // コンテンツ内での出現: 1点
        else if (content && content.toLowerCase().includes(lowerTag)) {
          score += 1;
        }
      }

      if (score > 0) {
        categoryScores[category] = score;
      }
    }

    const entries = Object.entries(categoryScores);
    if (entries.length === 0) {
      return null;
    }

    const [topCategory] = entries.sort((a, b) => b[1] - a[1]);
    return topCategory[0] as ArticleCategory;
  }

  /**
   * 複合的な分類（タグ優先、コンテンツ補助）
   */
  static classify(
    tags: Tag[] | { name: string }[],
    title: string,
    content?: string | null
  ): ArticleCategory | null {
    // まずタグベースで分類
    const tagCategory = this.classifyByTags(tags);
    if (tagCategory) {
      return tagCategory;
    }

    // タグで分類できない場合はコンテンツベース
    return this.classifyByContent(title, content);
  }

  /**
   * カテゴリの日本語名を取得
   */
  static getCategoryLabel(category: ArticleCategory | string | null): string {
    if (!category) return '未分類';
    
    const labels: Record<string, string> = {
      'frontend': 'フロントエンド',
      'backend': 'バックエンド',
      'ai_ml': 'AI・機械学習',  // Enumのアンダースコア形式に対応
      'security': 'セキュリティ',
      'devops': 'DevOps',
      'database': 'データベース',
      'mobile': 'モバイル',
      'web3': 'Web3',
      'design': 'デザイン',
      'testing': 'テスト',
      'performance': 'パフォーマンス',
      'architecture': 'アーキテクチャ'
    };

    return labels[category] || '未分類';
  }

  /**
   * すべてのカテゴリとラベルを取得
   */
  static getAllCategories(): Array<{ value: ArticleCategory; label: string }> {
    return Object.keys(CATEGORY_MAPPINGS).map(category => ({
      value: category as ArticleCategory,
      label: this.getCategoryLabel(category as ArticleCategory)
    }));
  }
}