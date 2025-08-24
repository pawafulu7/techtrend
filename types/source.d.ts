/**
 * ソース関連の共通型定義
 */

export type SourceCategory = 'all' | 'tech_blog' | 'company_blog' | 'personal_blog' | 'news_site' | 'community' | 'other';

export interface SourceStats {
  totalArticles: number;
  avgQualityScore: number;
  popularTags: string[];
  publishFrequency: number;
  lastPublished: Date | null;
  growthRate: number;
}

export interface SourceWithStats {
  id: string;
  name: string;
  type: string;
  url: string;
  enabled: boolean;
  category: SourceCategory;
  stats: SourceStats;
}