export type SourceCategoryId =
  | 'foreign'
  | 'domestic'
  | 'company'
  | 'presentation'
  | 'ai'
  | 'llm';

/**
 * arXiv AI source ID
 * Used for filtering academic papers from regular articles
 */
export const ARXIV_SOURCE_ID = 'cmfxa7efs0001teo0kjt70c5k';
export const ARXIV_SOURCE_NAME = 'arXiv AI';

/**
 * Claude Blog source ID
 * Used for consistent filtering across the app
 */
export const CLAUDE_BLOG_SOURCE_ID = 'claude_blog_official';
export const CLAUDE_BLOG_SOURCE_NAME = 'Claude Blog';

/**
 * Anthropic News source ID
 * Used for consistent filtering across the app
 */
export const ANTHROPIC_NEWS_SOURCE_ID = 'anthropic_news';
export const ANTHROPIC_NEWS_SOURCE_NAME = 'Anthropic News';

/**
 * DevelopersIO source IDs (Classmethod Inc.)
 * Used for UI subgrouping in CompanyFilter
 */
export const DEVELOPERSIO_SOURCE_IDS = [
  'developersio_aws',
  'developersio_security',
  'developersio_ai',
  'developersio_claude',
  'developersio_mcp',
] as const;

/**
 * Valid category IDs (readonly array)
 *
 * Single source of truth for SourceCategoryId validation.
 * Used for runtime checks in compatibility layer.
 */
export const VALID_CATEGORY_IDS: readonly SourceCategoryId[] = [
  'foreign',
  'domestic',
  'company',
  'presentation',
  'ai',
  'llm',
] as const;

export interface SourceCategory {
  id: SourceCategoryId;
  name: string;
  description: string;
  sourceIds: string[];
}

export const SOURCE_CATEGORIES: Record<SourceCategoryId, SourceCategory> = {
  foreign: {
    id: 'foreign',
    name: '海外ソース',
    description: '海外の技術情報サイト',
    sourceIds: [
      'cmdq3nww70003tegxm78oydnb', // Dev.to
      'hacker_news_202508', // Hacker News
      'github_blog_202508', // GitHub Blog
      'cloudflare_blog_202508', // Cloudflare Blog
      'mozilla_hacks_202508', // Mozilla Hacks
      'cmdq3nwwz0008tegx2eu8cozq', // Stack Overflow Blog
      'cmdq43ofy0000teolba9vrndf', // Google Developers Blog
      'medium_engineering_202508', // Medium Engineering
      'cmdq4382o0000tecrle79yxxl', // AWS
      'cmdq43k070000tekrnqlawd1y', // SRE
      // Phase 1: 大手テック企業エンジニアリングブログ
      'meta_engineering', // Meta Engineering
      'netflix_techblog', // Netflix TechBlog
      'spotify_engineering', // Spotify Engineering
      'pinterest_engineering', // Pinterest Engineering
      // Phase 2: 大手テック企業
      'stripe_engineering', // Stripe Engineering
      'discord_engineering', // Discord Engineering
      'slack_engineering', // Slack Engineering
      // Phase 2: クラウドネイティブ・Web
      'the_new_stack', // The New Stack
      'cncf_blog', // CNCF Blog
      'kubernetes_blog', // Kubernetes Blog
      'chrome_developers', // Chrome Developers
      // Phase 2: 言語公式ブログ
      'go_blog', // Go Blog
      'rust_blog', // Rust Blog
    ],
  },
  domestic: {
    id: 'domestic',
    name: '国内情報サイト',
    description: '日本の技術情報サイト',
    sourceIds: [
      'cmdq440c90000tewuti7ng0un', // Qiita Popular
      'cmdq3nwwp0006tegxz53w9zva', // Zenn
      'cmdq3nww60000tegxi8ruki95', // はてなブックマーク
      'cmdq3nwwf0004tegxuxj97z1k', // InfoQ Japan
      'cmdq3nwwu0007tegxcstlc8zt', // Publickey
      'cmdq3nwwk0005tegxdjv21wae', // Think IT
      'itmedia_security', // ITmedia Security
      'itmedia_aiplus', // ITmedia AI+
      'atit', // @IT
      'forbes_japan_ai', // Forbes Japan AI
    ],
  },
  company: {
    id: 'company',
    name: '企業ブログ',
    description: '日本企業の技術ブログ',
    sourceIds: [
      // 個別企業ブログ
      'freee_tech_blog', // freee Developers Hub
      'cyberagent_tech_blog', // CyberAgent Developers Blog
      'dena_tech_blog', // DeNA Engineering
      'smarthr_tech_blog', // SmartHR Tech Blog
      'lycorp_tech_blog', // LY Corporation Tech Blog
      'gmo_tech_blog', // GMO Developers
      'sansan_tech_blog', // Sansan Builders Box
      'mercari_tech_blog', // Mercari Engineering
      'zozo_tech_blog', // ZOZO TECH BLOG
      'moneyforward_tech_blog', // Money Forward Developers Blog
      'hatena_tech_blog', // Hatena Developer Blog
      'hatena_blog_dev', // 企業技術ブログ（hatena.blog/dev/entries）
      'pepabo_tech_blog', // ペパボテックブログ
      'cookpad_tech_blog', // Cookpad Tech Life
      // DevelopersIO（クラスメソッド社）
      'developersio_aws', // DevelopersIO AWS
      'developersio_security', // DevelopersIO Security
      'developersio_ai', // DevelopersIO AI
      'developersio_claude', // DevelopersIO Claude
      'developersio_mcp', // DevelopersIO MCP
    ],
  },
  presentation: {
    id: 'presentation',
    name: 'プレゼンテーション',
    description: 'スライド・プレゼン資料',
    sourceIds: [
      'speakerdeck_8a450c43f9418ff6', // Speaker Deck
      'docswell_a4539889f7debebd', // Docswell
    ],
  },
  ai: {
    id: 'ai',
    name: 'AI',
    description: 'AI関連の技術情報',
    sourceIds: [
      'cmfwpq7dc0000te8m6fd12f0x', // OpenAI Blog
      'cmdwmplco0001tec833nye4ak', // Hugging Face Blog
      'cmfxa7efj0000teo06dhbox6e', // Hugging Face Papers
      'cmfxa7efs0001teo0kjt70c5k', // arXiv AI
      'cmfxa7efx0002teo03tglf5fs', // Zenn AI
      'cmfxa7egc0003teo0ofke77yu', // Qiita AI
      'developersio_ai', // DevelopersIO AI (generative-ai)
      'developersio_claude', // DevelopersIO Claude
      'developersio_mcp', // DevelopersIO MCP
      CLAUDE_BLOG_SOURCE_ID, // Claude Blog
      ANTHROPIC_NEWS_SOURCE_ID, // Anthropic News
      'itmedia_aiplus', // ITmedia AI+
      'forbes_japan_ai', // Forbes Japan AI
    ],
  },
  llm: {
    id: 'llm',
    name: 'LLM',
    description: '大規模言語モデル関連',
    sourceIds: [
      'cmdwmplc10000tec8vg2t9r2o', // Google AI Blog
    ],
  },
};

// ヘルパー関数
export function getCategoryBySourceId(
  sourceId: string
): SourceCategory | undefined {
  return Object.values(SOURCE_CATEGORIES).find((category) =>
    category.sourceIds.includes(sourceId)
  );
}

export function getCategoryById(categoryId: SourceCategoryId): SourceCategory {
  return SOURCE_CATEGORIES[categoryId];
}

export function getAllCategories(): SourceCategory[] {
  return Object.values(SOURCE_CATEGORIES);
}

export function getSourceIdsByCategory(categoryId: SourceCategoryId): string[] {
  return SOURCE_CATEGORIES[categoryId]?.sourceIds || [];
}

// ソースをカテゴリごとにグループ化
export function groupSourcesByCategory(
  sources: Array<{ id: string; name: string }>
): Map<SourceCategory, Array<{ id: string; name: string }>> {
  const grouped = new Map<
    SourceCategory,
    Array<{ id: string; name: string }>
  >();

  // まず全カテゴリを初期化
  getAllCategories().forEach((category) => {
    grouped.set(category, []);
  });

  // ソースをカテゴリごとに振り分け
  sources.forEach((source) => {
    const category = getCategoryBySourceId(source.id);
    if (category) {
      const categorySources = grouped.get(category) || [];
      categorySources.push(source);
      grouped.set(category, categorySources);
    }
  });

  return grouped;
}
