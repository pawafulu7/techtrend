import { Prisma, TrendPeriodType } from '@prisma/client';

// JST offset constant (+9 hours in milliseconds)
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// Legacy AI summary minimum length threshold
export const LEGACY_SUMMARY_MIN_LENGTH = 100;

// Prompt version management
export const PROMPT_VERSION = '2.3.0';

// Category tag definitions (case-insensitive comparison)
export const CATEGORY_TAGS = {
  Frontend: [
    'React',
    'Vue',
    'Angular',
    'CSS',
    'JavaScript',
    'TypeScript',
    'Next.js',
    'Svelte',
  ],
  Backend: [
    'Node.js',
    'Python',
    'Ruby',
    'Go',
    'Java',
    'PHP',
    'Rails',
    'Django',
    'FastAPI',
  ],
  'AI/ML': [
    'AI',
    'LLM',
    'Claude',
    'GPT',
    'Gemini',
    '機械学習',
    'ChatGPT',
    'OpenAI',
    'Anthropic',
    'RAG',
  ],
  Security: [
    'セキュリティ',
    'Security',
    '脆弱性',
    'CVE',
    'XSS',
    'CSRF',
    '認証',
  ],
  DevOps: [
    'Docker',
    'Kubernetes',
    'CI/CD',
    'AWS',
    'GCP',
    'Azure',
    'Jenkins',
    'GitHub Actions',
  ],
  Database: [
    'PostgreSQL',
    'MySQL',
    'MongoDB',
    'Redis',
    'SQL',
    'NoSQL',
    'Prisma',
  ],
  Mobile: ['iOS', 'Android', 'Flutter', 'React Native', 'Swift', 'Kotlin'],
} as const;

// Type definitions
export type ArticleWithRelations = Prisma.ArticleGetPayload<{
  include: {
    tags: true;
    source: true;
    _count: {
      select: {
        articleViews: true;
        favorites: true;
      };
    };
  };
}>;

export interface TopArticleInfo {
  id: string;
  title: string;
  translatedTitle?: string | null;
  url: string;
  sourceName: string;
  viewCount: number;
  favoriteCount: number;
  score: number;
  tags: string[];
  thumbnail?: string | null;
  detailedSummary?: string | null;
}

export interface CategoryInfo {
  name: string;
  count: number;
  percentage: number;
  topArticle: {
    id: string;
    title: string;
    translatedTitle?: string | null;
  } | null;
}

export interface TagInfo {
  name: string;
  count: number;
  percentage: number;
}

export interface TrendReportData {
  periodType: TrendPeriodType;
  periodStart: Date;
  periodEnd: Date;
  articleCount: number;
  topArticles: TopArticleInfo[];
  categories: CategoryInfo[];
  tags: TagInfo[];
  aiSummary?: string;
  aiModel?: string;
  promptVersion?: string;
  generatedAt?: Date;
}
