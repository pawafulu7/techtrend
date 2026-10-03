/**
 * TagService Tests
 *
 * resolveTags の JS 側の処理（作る順・カテゴリ・解決できないときの例外・tx の受け渡し）を確かめる。
 * SQL での照合（lower(name)、ON CONFLICT DO NOTHING、件数の上限）は実 DB の結合テスト
 * __tests__/integration/services/tag-service.test.ts で確かめる。
 */

// Mock TagNormalizer
jest.mock('@/lib/services/tag-normalizer', () => ({
  TagNormalizer: {
    normalizeTags: (tags: string[]) => {
      // Simple normalization: capitalize and deduplicate
      const seen = new Set<string>();
      return tags
        .map((t) => t.trim())
        .filter((t) => {
          if (!t || seen.has(t)) return false;
          seen.add(t);
          return true;
        })
        .map((name) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
        }));
    },
    normalize: (tag: string) => ({ name: tag.trim() }),
    inferCategory: () => null,
  },
}));

import { prisma } from '@/lib/prisma';
import {
  getOrCreateTags,
  getTagIdsForConnect,
  normalizeTagNames,
  resolveTags,
} from '@/lib/services/tag-service';

const prismaMock = prisma as unknown as {
  $queryRaw: jest.Mock;
  tag: { createMany: jest.Mock };
};

type Row = {
  ord: number;
  input: string;
  id: string | null;
  name: string | null;
  category: string | null;
};

const found = (ord: number, input: string, name = input): Row => ({
  ord,
  input,
  id: `id:${name}`,
  name,
  category: null,
});
const missing = (ord: number, input: string): Row => ({
  ord,
  input,
  id: null,
  name: null,
  category: null,
});

/** $queryRaw に渡された値（テンプレートの埋め込み値）から、入力の名前の配列を取り出す */
function namesPassedTo(call: unknown[]): unknown {
  return call.slice(1).find((value) => Array.isArray(value));
}

describe('TagService', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.tag.createMany.mockReset();
    prismaMock.tag.createMany.mockResolvedValue({ count: 0 });
  });

  describe('resolveTags', () => {
    it('returns existing tags in input order without creating any', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        found(1, 'Mcp', 'MCP'),
        found(2, 'Rust'),
      ]);

      const tags = await resolveTags([{ name: 'Mcp' }, { name: 'Rust' }]);

      expect(tags).toEqual([
        { id: 'id:MCP', name: 'MCP', category: null },
        { id: 'id:Rust', name: 'Rust', category: null },
      ]);
      expect(prismaMock.tag.createMany).not.toHaveBeenCalled();
    });

    it('trims names and skips empty ones before querying', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([found(1, 'Go')]);

      await resolveTags([{ name: '  Go ' }, { name: '   ' }, { name: '' }]);

      expect(namesPassedTo(prismaMock.$queryRaw.mock.calls[0])).toEqual(['Go']);
    });

    it('does not touch the DB for empty input', async () => {
      expect(await resolveTags([{ name: ' ' }])).toEqual([]);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('creates only missing tags, sorted by key, with skipDuplicates and their category', async () => {
      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          missing(1, 'zod'),
          found(2, 'Rust'),
          missing(3, 'Astro'),
        ])
        .mockResolvedValueOnce([found(1, 'zod'), found(2, 'Astro')]);

      const tags = await resolveTags([
        { name: 'zod', category: 'library' },
        { name: 'Rust' },
        { name: 'Astro' },
      ]);

      expect(prismaMock.tag.createMany).toHaveBeenCalledWith({
        data: [
          { name: 'Astro', category: null },
          { name: 'zod', category: 'library' },
        ],
        skipDuplicates: true,
      });
      // 引き直しは作ったキーだけ
      expect(namesPassedTo(prismaMock.$queryRaw.mock.calls[1])).toEqual([
        'zod',
        'Astro',
      ]);
      expect(tags.map((t) => t.name)).toEqual(['zod', 'Rust', 'Astro']);
    });

    it('takes the category of a differently-cased input, keeping the first spelling', async () => {
      prismaMock.$queryRaw
        .mockResolvedValueOnce([missing(1, 'Go')])
        .mockResolvedValueOnce([found(1, 'Go')]);

      await resolveTags([{ name: 'Go' }, { name: 'GO', category: 'language' }]);

      expect(prismaMock.tag.createMany).toHaveBeenCalledWith({
        data: [{ name: 'Go', category: 'language' }],
        skipDuplicates: true,
      });
    });

    it('returns the row created concurrently under another spelling', async () => {
      prismaMock.$queryRaw
        .mockResolvedValueOnce([missing(1, 'Mcp')])
        // createMany は衝突で捨てられ、引き直しで別の要求が作った MCP が返る
        .mockResolvedValueOnce([found(1, 'Mcp', 'MCP')]);

      const [tag] = await resolveTags([{ name: 'Mcp' }]);

      expect(tag.name).toBe('MCP');
    });

    it('throws when a key cannot be resolved after creating', async () => {
      prismaMock.$queryRaw
        .mockResolvedValueOnce([missing(1, 'Ghost')])
        .mockResolvedValueOnce([missing(1, 'Ghost')]);

      await expect(resolveTags([{ name: 'Ghost' }])).rejects.toThrow(
        'Failed to resolve tag: Ghost'
      );
    });

    it('creates missing tags with the given transaction client, not the global one', async () => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([missing(1, 'Go')])
          .mockResolvedValueOnce([found(1, 'Go')]),
        tag: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };

      await resolveTags([{ name: 'Go' }], tx as never);

      expect(tx.tag.createMany).toHaveBeenCalledTimes(1);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prismaMock.tag.createMany).not.toHaveBeenCalled();
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('uses the given transaction client', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([found(1, 'Go')]),
        tag: { createMany: jest.fn() },
      };

      await resolveTags([{ name: 'Go' }], tx as never);

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('getOrCreateTags', () => {
    it('returns an empty array for empty input', async () => {
      expect(await getOrCreateTags([])).toEqual([]);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('normalizes names before resolving', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([found(1, 'React')]);

      await getOrCreateTags(['react', 'react']);

      expect(namesPassedTo(prismaMock.$queryRaw.mock.calls[0])).toEqual([
        'React',
      ]);
    });

    it('skips normalization when normalize is false', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([found(1, 'react')]);

      await getOrCreateTags(['react'], { normalize: false });

      expect(namesPassedTo(prismaMock.$queryRaw.mock.calls[0])).toEqual([
        'react',
      ]);
    });

    it('passes maxTags to the query instead of slicing before removing case duplicates', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        found(1, 'MCP'),
        found(3, 'Rust'),
      ]);

      await getOrCreateTags(['MCP', 'Mcp', 'Rust'], {
        normalize: false,
        maxTags: 2,
      });

      // 3 つとも SQL に渡す（キーで重複を除いた後に件数を絞るのは SQL 側）
      expect(namesPassedTo(prismaMock.$queryRaw.mock.calls[0])).toEqual([
        'MCP',
        'Mcp',
        'Rust',
      ]);
      // 件数は LIMIT の Prisma.sql の値として埋め込まれる
      const limitValues = prismaMock.$queryRaw.mock.calls[0]
        .slice(1)
        .flatMap((value: unknown) =>
          value && typeof value === 'object' && 'values' in value
            ? (value as { values: unknown[] }).values
            : []
        );
      expect(limitValues).toContain(2);
    });

    it('uses the transaction client when given', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([found(1, 'Go')]),
        tag: { createMany: jest.fn() },
      };

      await getOrCreateTags(['go'], undefined, tx as never);

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('getTagIdsForConnect', () => {
    it('returns the IDs of the resolved tags', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        found(1, 'React'),
        found(2, 'Vue'),
      ]);

      expect(await getTagIdsForConnect(['react', 'vue'])).toEqual([
        { id: 'id:React' },
        { id: 'id:Vue' },
      ]);
    });
  });

  describe('normalizeTagNames', () => {
    it('normalizes and deduplicates tag names', () => {
      expect(normalizeTagNames(['react', 'react', 'vue'])).toEqual([
        'React',
        'Vue',
      ]);
    });

    it('returns an empty array for empty input', () => {
      expect(normalizeTagNames([])).toEqual([]);
    });
  });
});
