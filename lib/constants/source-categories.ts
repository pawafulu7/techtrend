export type SourceCategoryId = 'foreign' | 'domestic' | 'company' | 'presentation';

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
      'cmdq3nww70003tegxm78oydnb',  // Dev.to
      'hacker_news_202508',          // Hacker News
      'github_blog_202508',          // GitHub Blog
      'cloudflare_blog_202508',      // Cloudflare Blog
      'mozilla_hacks_202508',        // Mozilla Hacks
      'cmdq3nwwz0008tegx2eu8cozq',  // Stack Overflow Blog
      'cmdq43ofy0000teolba9vrndf',  // Google Developers Blog
      'cmdwmplc10000tec8vg2t9r2o',  // Google AI Blog
      'cmdwmplco0001tec833nye4ak',  // Hugging Face Blog
      'medium_engineering_202508',   // Medium Engineering
      'cmdq4382o0000tecrle79yxxl',  // AWS
      'cmdq43k070000tekrnqlawd1y'   // SRE
    ]
  },
  domestic: {
    id: 'domestic',
    name: '国内情報サイト',
    description: '日本の技術情報サイト',
    sourceIds: [
      'cmdq440c90000tewuti7ng0un',  // Qiita Popular
      'cmdq3nwwp0006tegxz53w9zva',  // Zenn
      'cmdq3nww60000tegxi8ruki95',  // はてなブックマーク
      'cmdq3nwwf0004tegxuxj97z1k',  // InfoQ Japan
      'cmdq3nwwu0007tegxcstlc8zt',  // Publickey
      'cmdq3nwwk0005tegxdjv21wae'   // Think IT
    ]
  },
  company: {
    id: 'company',
    name: '企業ブログ',
    description: '日本企業の技術ブログ',
    sourceIds: [
      // 個別企業ブログ
      'freee_tech_blog',            // freee Developers Hub
      'cyberagent_tech_blog',       // CyberAgent Developers Blog
      'dena_tech_blog',             // DeNA Engineering
      'smarthr_tech_blog',          // SmartHR Tech Blog
      'lycorp_tech_blog',           // LY Corporation Tech Blog
      'gmo_tech_blog',              // GMO Developers
      'sansan_tech_blog',           // Sansan Builders Box
      'mercari_tech_blog',          // Mercari Engineering
      'zozo_tech_blog',             // ZOZO TECH BLOG
      'moneyforward_tech_blog',     // Money Forward Developers Blog
      'hatena_tech_blog',           // Hatena Developer Blog
      'pepabo_tech_blog',           // ペパボテックブログ
      'cookpad_tech_blog',          // Cookpad Tech Life
      // 旧統合ソース（移行期間中は残す）
      'cmdwgsk1b0000te2vrjnpm6gc'   // Corporate Tech Blog (legacy)
    ]
  },
  presentation: {
    id: 'presentation',
    name: 'プレゼンテーション',
    description: 'スライド・プレゼン資料',
    sourceIds: [
      'speakerdeck_8a450c43f9418ff6',  // Speaker Deck
      'docswell_a4539889f7debebd'      // Docswell
    ]
  }
};

// ヘルパー関数
export function getCategoryBySourceId(sourceId: string): SourceCategory | undefined {
  return Object.values(SOURCE_CATEGORIES).find(category => 
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
export function groupSourcesByCategory(sources: Array<{ id: string; name: string }>): Map<SourceCategory, Array<{ id: string; name: string }>> {
  const grouped = new Map<SourceCategory, Array<{ id: string; name: string }>>();
  
  // まず全カテゴリを初期化
  getAllCategories().forEach(category => {
    grouped.set(category, []);
  });
  
  // ソースをカテゴリごとに振り分け
  sources.forEach(source => {
    const category = getCategoryBySourceId(source.id);
    if (category) {
      const categorySources = grouped.get(category) || [];
      categorySources.push(source);
      grouped.set(category, categorySources);
    }
  });
  
  return grouped;
}