/**
 * タグと興味の分野の対応付け（TagCategoryMapping）
 *
 * constants.ts の tagPatterns に名前が合うタグを、その分野に対応付ける。対応付けは重心の計算
 * （centroid-service.ts）とダイジェストの「見逃した注目記事」が使う。
 * seed（prisma/seed/interest-categories.ts）と週 1 回の更新（scripts/scheduled/refresh-personalization.ts）が呼ぶ。
 * 対応付けはパターンだけから作るので、パターンに合わなくなった組は消す（パターンを直せば分類も直る）
 */

import { PrismaClient } from '@/lib/prisma-exports';
import { TagNormalizer } from '@/lib/services/tag-normalizer';
import { INTEREST_CATEGORIES, isGenericTag } from './constants';
import type { InterestCategorySlug } from './types';

/**
 * 小文字にしたタグ名から分野の slug への対応。パターンを TagNormalizer で正規化した名前と、
 * パターンそのものの名前の両方を入れる
 */
export function buildNormalizedPatternMap(): Map<
  string,
  InterestCategorySlug[]
> {
  const patternMap = new Map<string, InterestCategorySlug[]>();
  const add = (name: string, slug: InterestCategorySlug) => {
    const slugs = patternMap.get(name) ?? [];
    if (!slugs.includes(slug)) {
      slugs.push(slug);
      patternMap.set(name, slugs);
    }
  };

  for (const category of INTEREST_CATEGORIES) {
    for (const pattern of category.tagPatterns) {
      add(TagNormalizer.normalize(pattern).name.toLowerCase(), category.slug);
      add(pattern.toLowerCase(), category.slug);
    }
  }

  return patternMap;
}

/**
 * タグ名に合う分野の slug を返す（正規化した名前と元の名前の両方で引く）。意味の広いタグは対応付けない
 */
export function matchCategorySlugs(
  tagName: string,
  patternMap: Map<string, InterestCategorySlug[]>
): InterestCategorySlug[] {
  if (isGenericTag(tagName)) return [];
  const names = new Set([
    TagNormalizer.normalize(tagName).name.toLowerCase(),
    tagName.toLowerCase(),
  ]);
  const slugs = new Set<InterestCategorySlug>();
  for (const name of names) {
    for (const slug of patternMap.get(name) ?? []) slugs.add(slug);
  }
  return [...slugs];
}

/**
 * 対応付けをパターンに合わせる。パターンに合うのに無い組を足し、合わない組を消す。足した数と消した数を返す
 */
export async function syncTagCategoryMappings(
  db: PrismaClient
): Promise<{ created: number; deleted: number }> {
  const [categories, tags, existing] = await Promise.all([
    db.interestCategory.findMany({ select: { id: true, slug: true } }),
    db.tag.findMany({ select: { id: true, name: true } }),
    db.tagCategoryMapping.findMany({
      select: { id: true, tagId: true, categoryId: true },
    }),
  ]);
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const patternMap = buildNormalizedPatternMap();
  const pairKey = (tagId: string, categoryId: string) =>
    `${tagId}\u0000${categoryId}`;

  const wanted = new Map<string, { tagId: string; categoryId: string }>();
  for (const tag of tags) {
    for (const slug of matchCategorySlugs(tag.name, patternMap)) {
      const categoryId = categoryIdBySlug.get(slug);
      if (categoryId) {
        wanted.set(pairKey(tag.id, categoryId), { tagId: tag.id, categoryId });
      }
    }
  }
  const existingKeys = new Set(
    existing.map((m) => pairKey(m.tagId, m.categoryId))
  );

  const toCreate = [...wanted]
    .filter(([key]) => !existingKeys.has(key))
    .map(([, pair]) => pair);
  const toDelete = existing
    .filter((m) => !wanted.has(pairKey(m.tagId, m.categoryId)))
    .map((m) => m.id);
  if (toCreate.length === 0 && toDelete.length === 0) {
    return { created: 0, deleted: 0 };
  }

  const [created, deleted] = await db.$transaction([
    db.tagCategoryMapping.createMany({ data: toCreate, skipDuplicates: true }),
    db.tagCategoryMapping.deleteMany({ where: { id: { in: toDelete } } }),
  ]);
  return { created: created.count, deleted: deleted.count };
}
