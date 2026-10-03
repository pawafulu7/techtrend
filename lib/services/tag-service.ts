/**
 * Tag Service
 *
 * タグを「探す・作る」処理をここに集める。タグの同一性のキーは lower(name)
 * （大文字小文字だけが違う表記を同じタグとして扱う。#672）。
 */

import { Prisma, PrismaClient, Tag } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import { TagNormalizer } from './tag-normalizer';

export interface TagServiceOptions {
  /** Maximum number of tags to process in a single call */
  maxTags?: number;
  /** Whether to normalize tag names before processing */
  normalize?: boolean;
}

const DEFAULT_OPTIONS: Required<TagServiceOptions> = {
  maxTags: 10,
  normalize: true,
};

export interface TagInput {
  name: string;
  category?: string;
}

export interface ResolveTagsOptions {
  /** キーで重複を除いた後に、入力の順で先頭から何件まで扱うか */
  maxTags?: number;
}

type TagClient = PrismaClient | Prisma.TransactionClient;

interface ResolvedRow {
  ord: bigint;
  input: string;
  id: string | null;
  name: string | null;
  category: string | null;
}

/**
 * 入力の名前を lower(name) のキーで重複除去し（同じキーは最初の 1 つ）、
 * 既存のタグを引く。同じキーのタグが複数ある（既存の重複）ときは、入力と
 * 完全一致する表記、無ければ name の C 照合順で最初のものを返す。
 *
 * キーの計算は SQL の lower() で行う。JS の toLowerCase() は非 ASCII の文字で
 * PostgreSQL と結果が違い、照合が食い違うため。
 */
async function findByKey(
  client: TagClient,
  names: string[],
  maxTags?: number
): Promise<ResolvedRow[]> {
  const limit =
    maxTags === undefined ? Prisma.empty : Prisma.sql`LIMIT ${maxTags}`;
  return client.$queryRaw<ResolvedRow[]>`
    WITH dedup AS (
      SELECT DISTINCT ON (lower(u.name)) u.name, u.ord
      FROM unnest(${names}::text[]) WITH ORDINALITY AS u(name, ord)
      ORDER BY lower(u.name), u.ord
    ),
    input AS (
      SELECT name, ord FROM dedup ORDER BY ord ${limit}
    )
    SELECT DISTINCT ON (i.ord)
      i.ord, i.name AS input, t.id, t.name, t.category
    FROM input i
    LEFT JOIN "Tag" t ON lower(t.name) = lower(i.name)
    ORDER BY i.ord, (t.name = i.name) DESC NULLS LAST, t.name COLLATE "C"
  `;
}

/**
 * 作る順を決めるための比較（大文字小文字を無視し、同じなら表記で比べる）。
 * 照合には使わないので、JS の toLowerCase() と PostgreSQL の lower() の違いは問題にならない
 */
function compareKey(a: string, b: string): number {
  const ka = a.toLowerCase();
  const kb = b.toLowerCase();
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * タグを lower(name) のキーで探し、無いものだけ作って、入力の順に返す。
 *
 * - 名前は trim し、空は捨てる
 * - 大文字小文字だけが違う入力は 1 つにまとめる（最初の表記を使う）
 * - 既存のタグがあれば、その表記のタグを返す（新しい表記では作らない）
 * - 新しく作るタグは createMany の skipDuplicates（ON CONFLICT DO NOTHING）で作る。
 *   同時に別の要求が作っていれば、引き直しでそちらの行が返る
 * - 行を返せないキーが残ったら例外にする（黙って落とすと、タグが欠けた記事ができる）
 */
export async function resolveTags(
  tags: TagInput[],
  client: TagClient = prisma,
  options: ResolveTagsOptions = {}
): Promise<Tag[]> {
  // 新しく作るタグの category は、大文字小文字だけが違う入力も含めて、最初に
  // category が付いていた入力から取る（表記は最初の入力のものを使う）。キーは照合では
  // なく category の補完にしか使わないので、JS の toLowerCase() の近似で足りる
  const categoryByKey = new Map<string, string>();
  const names: string[] = [];
  for (const tag of tags) {
    const name = tag.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (tag.category && !categoryByKey.has(key)) {
      categoryByKey.set(key, tag.category);
    }
    names.push(name);
  }
  if (names.length === 0) return [];

  const rows = await findByKey(client, names, options.maxTags);
  const missing = rows.filter((row) => row.id === null);

  let created: ResolvedRow[] = [];
  if (missing.length > 0) {
    // 同時に走るトランザクションが逆の順で作るとデッドロックになるので、順をそろえる
    const data = missing
      .map((row) => ({
        name: row.input,
        category: categoryByKey.get(row.input.toLowerCase()) ?? null,
      }))
      .sort((a, b) => compareKey(a.name, b.name));
    await client.tag.createMany({ data, skipDuplicates: true });
    created = await findByKey(
      client,
      missing.map((row) => row.input)
    );
  }

  const createdByInput = new Map(created.map((row) => [row.input, row]));
  return rows.map((row) => {
    const resolved = row.id === null ? createdByInput.get(row.input) : row;
    if (!resolved || resolved.id === null || resolved.name === null) {
      throw new Error(`Failed to resolve tag: ${row.input}`);
    }
    return {
      id: resolved.id,
      name: resolved.name,
      category: resolved.category,
    };
  });
}

/**
 * タグ名のキー（lower(name)）に当たるタグの ID をすべて返す（作らない）。
 *
 * 読み出しでタグ名を大文字小文字を区別せずに照合するときに使う。Prisma の
 * `mode: 'insensitive'` は ILIKE になり、名前の `_` や `%` がワイルドカードとして
 * 効くため（例: "Claude_Code" が "Claude Code" にも当たる）、照合は lower() で行う。
 * 既存の重複（同じキーのタグが複数）がある間は、その全部の ID を返す。
 */
export async function findTagIdsByNames(
  names: string[],
  client: TagClient = prisma
): Promise<string[]> {
  const trimmed = names.map((name) => name.trim()).filter(Boolean);
  if (trimmed.length === 0) return [];
  const rows = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Tag"
    WHERE lower(name) IN (SELECT lower(x) FROM unnest(${trimmed}::text[]) AS x)
    ORDER BY name COLLATE "C"
  `;
  return rows.map((row) => row.id);
}

/**
 * Get or create tags safely.
 * 大文字小文字だけが違う既存のタグがあれば、そのタグを返す。
 *
 * @param tagNames - Array of tag names to get or create
 * @param options - Optional configuration
 * @returns Array of Tag objects (existing or newly created)
 */
export async function getOrCreateTags(
  tagNames: string[],
  options?: TagServiceOptions,
  tx?: Prisma.TransactionClient
): Promise<Tag[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!tagNames || tagNames.length === 0) {
    return [];
  }

  const inputs: TagInput[] = opts.normalize
    ? TagNormalizer.normalizeTags(tagNames)
    : tagNames.map((name) => ({ name }));

  return resolveTags(inputs, tx ?? prisma, { maxTags: opts.maxTags });
}

/**
 * Get or create tags with category inference.
 * Categories are inferred from TagNormalizer rules.
 *
 * @param tagNames - Array of tag names to get or create
 * @param options - Optional configuration
 * @returns Array of Tag objects with categories set if inferable
 */
export async function getOrCreateTagsWithCategory(
  tagNames: string[],
  options?: TagServiceOptions
): Promise<Tag[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!tagNames || tagNames.length === 0) {
    return [];
  }

  // Always use normalization to get categories
  const normalizedTags = TagNormalizer.normalizeTags(tagNames);

  return resolveTags(normalizedTags, prisma, { maxTags: opts.maxTags });
}

/**
 * Get tag IDs for connecting to articles.
 * This is a convenience wrapper that returns just the IDs.
 *
 * @param tagNames - Array of tag names
 * @param options - Optional configuration
 * @returns Array of tag IDs for use in Prisma connect
 */
export async function getTagIdsForConnect(
  tagNames: string[],
  options?: TagServiceOptions,
  tx?: Prisma.TransactionClient
): Promise<{ id: string }[]> {
  const tags = await getOrCreateTags(tagNames, options, tx);
  return tags.map((tag) => ({ id: tag.id }));
}

/**
 * Normalize tag names without creating them.
 * Useful for pre-processing before batch operations.
 *
 * @param tagNames - Array of tag names to normalize
 * @returns Array of normalized, deduplicated tag names
 */
export function normalizeTagNames(tagNames: string[]): string[] {
  const normalized = TagNormalizer.normalizeTags(tagNames);
  return normalized.map((t) => t.name);
}

export const TagService = {
  getOrCreateTags,
  getOrCreateTagsWithCategory,
  getTagIdsForConnect,
  normalizeTagNames,
  resolveTags,
};

export default TagService;
