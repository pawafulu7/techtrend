/**
 * Article Category Normalizer
 *
 * レガシーカテゴリ名を新しいArticleCategory列挙型に変換
 */

import { ArticleCategory } from '@prisma/client';

// レガシーカテゴリ名のマッピング
const CATEGORY_ALIASES: Record<string, ArticleCategory> = {
  // 旧カテゴリ名 -> 新カテゴリ名
  'TECH': ArticleCategory.frontend,
  'FRONTEND': ArticleCategory.frontend,
  'BACKEND': ArticleCategory.backend,
  'INFRASTRUCTURE': ArticleCategory.devops,  // infrastructureはdevopsにマップ
  'DEVOPS': ArticleCategory.devops,
  'AI': ArticleCategory.ai_ml,
  'AI_ML': ArticleCategory.ai_ml,
  'MACHINE_LEARNING': ArticleCategory.ai_ml,
  'MOBILE': ArticleCategory.mobile,
  'SECURITY': ArticleCategory.security,
  'DATABASE': ArticleCategory.database,
  'DATA': ArticleCategory.database,
  'DESIGN': ArticleCategory.design,
  'TESTING': ArticleCategory.testing,
  'PERFORMANCE': ArticleCategory.performance,
  'ARCHITECTURE': ArticleCategory.architecture,
  'WEB3': ArticleCategory.web3,
  // 以下、存在しないカテゴリは適切にマップ
  'GAME': ArticleCategory.frontend,  // ゲームはfrontendとして扱う
  'MANAGEMENT': ArticleCategory.architecture,  // 管理はアーキテクチャとして扱う
  'CAREER': ArticleCategory.frontend,  // キャリアは汎用的にfrontendとして扱う
  'EVENT': ArticleCategory.frontend,  // イベントも汎用的にfrontendとして扱う
  'OTHER': ArticleCategory.frontend,  // その他も汎用的にfrontendとして扱う

  // 新カテゴリ名（小文字）もサポート
  'frontend': ArticleCategory.frontend,
  'backend': ArticleCategory.backend,
  'infrastructure': ArticleCategory.devops,  // infrastructureはdevopsにマップ
  'devops': ArticleCategory.devops,
  'ai_ml': ArticleCategory.ai_ml,
  'mobile': ArticleCategory.mobile,
  'security': ArticleCategory.security,
  'database': ArticleCategory.database,
  'web3': ArticleCategory.web3,
  'design': ArticleCategory.design,
  'testing': ArticleCategory.testing,
  'performance': ArticleCategory.performance,
  'architecture': ArticleCategory.architecture,
};

/**
 * カテゴリ文字列を正規化してArticleCategory列挙型に変換
 *
 * @param category - 入力カテゴリ文字列
 * @returns 正規化されたArticleCategory、または不明な場合はnull
 */
export function normalizeArticleCategory(category: string | undefined | null): ArticleCategory | null {
  if (!category) {
    return null;
  }

  // 大文字に変換して検索
  const upperCategory = category.toUpperCase();
  const normalized = CATEGORY_ALIASES[upperCategory];

  if (normalized) {
    return normalized;
  }

  // 小文字でも試す
  const lowerCategory = category.toLowerCase();
  const normalizedLower = CATEGORY_ALIASES[lowerCategory];

  if (normalizedLower) {
    return normalizedLower;
  }

  // 直接ArticleCategory列挙型の値と一致するか確認
  if (Object.values(ArticleCategory).includes(category as ArticleCategory)) {
    return category as ArticleCategory;
  }

  // 不明なカテゴリ
  return null;
}

/**
 * カテゴリ配列を正規化
 *
 * @param categories - 入力カテゴリ配列
 * @returns 正規化されたArticleCategory配列
 */
export function normalizeArticleCategories(categories: (string | undefined | null)[]): ArticleCategory[] {
  return categories
    .map(cat => normalizeArticleCategory(cat))
    .filter((cat): cat is ArticleCategory => cat !== null);
}

/**
 * レガシーカテゴリ名かどうかを判定
 *
 * @param category - チェックするカテゴリ名
 * @returns レガシーカテゴリ名の場合true
 */
export function isLegacyCategory(category: string): boolean {
  const upperCategory = category.toUpperCase();
  return upperCategory in CATEGORY_ALIASES &&
         !Object.values(ArticleCategory).includes(category as ArticleCategory);
}