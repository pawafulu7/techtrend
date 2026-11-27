/**
 * generate-tags.ts の additive connect パターン回帰テスト
 *
 * テスト対象:
 * - 既存タグを保持すること（additive connect — disconnectなし）
 * - 同一タグを再追加しても connect が呼ばれないこと（冪等性）
 *
 * アプローチ:
 * - generateTagsForArticles を直接テストする
 * - prisma.article.findMany → 1件返す
 * - node-fetch（Gemini API） → タグ文字列を返す（jest.config.node.jsで自動モック済み）
 * - getOrCreateTags → タグレコードを返す
 * - prisma.$transaction → コールバックを即実行し、tx の呼び出しを検証
 */

jest.mock('@/lib/tags/tag-service', () => ({
  getOrCreateTags: jest.fn(),
}));

jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onBulkImport: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/config/env', () => ({
  env: {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'test-model',
  },
}));

// node-fetch は jest.config.node.js で __tests__/__mocks__/node-fetch.ts に自動マップ済み
import fetch from 'node-fetch';
import { prisma } from '@/lib/prisma';
import { getOrCreateTags } from '@/lib/tags/tag-service';
import { generateTagsForArticles } from '@/scripts/scheduled/generate-tags';
import { env } from '@/lib/config/env';

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockGetOrCreateTags = getOrCreateTags as jest.MockedFunction<typeof getOrCreateTags>;

/** Gemini API 応答をモックするヘルパー */
function mockGeminiResponse(tagLine: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: `タグ: ${tagLine}` }],
          },
        },
      ],
    }),
    text: async () => '',
  } as any);
}

/** テスト用記事スタブを生成するヘルパー */
function makeArticleStub(id: string, existingTagIds: number[]) {
  return {
    id,
    title: 'テスト記事タイトル',
    url: `https://example.com/article-${id}`,
    content: '記事の本文内容',
    summary: null,
    source: {
      id: 'source-1',
      name: 'Test Source',
    },
    tags: existingTagIds.map((tid) => ({ id: tid })),
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceId: 'source-1',
  };
}

describe('generate-tags additive connect pattern', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // prisma.$disconnect のデフォルトモック
    (prisma.$disconnect as jest.Mock).mockResolvedValue(undefined);
  });

  describe('tag update preserves existing tags', () => {
    it('should only connect tags not already attached to the article', async () => {
      // 既存タグ: A(id:1), B(id:2) がある記事
      const article = makeArticleStub('article-1', [1, 2]);

      // findMany が1件返す（タグなし記事クエリに引っかかると仮定）
      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([article]) // articlesWithoutTags
        .mockResolvedValueOnce([]);       // articlesWithOnlyArticleTag

      // Gemini API: B, C を返す
      mockGeminiResponse('B, C');

      // getOrCreateTags: B(id:2), C(id:3) のレコードを返す
      mockGetOrCreateTags.mockResolvedValueOnce([
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ] as any);

      // $transaction コールバックを実行するモック
      // tx.article.findUniqueOrThrow: 現在のタグを返す（A:1, B:2）
      const txFindUniqueOrThrow = jest.fn().mockResolvedValue({
        tags: [{ id: 1 }, { id: 2 }],
      });
      const txArticleUpdate = jest.fn().mockResolvedValue({});
      const txClient = {
        article: {
          findUniqueOrThrow: txFindUniqueOrThrow,
          update: txArticleUpdate,
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        (fn: (tx: typeof txClient) => Promise<void>) => fn(txClient)
      );

      await generateTagsForArticles();

      // findUniqueOrThrow で現在タグを読み取ること
      expect(txFindUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'article-1' },
        select: { tags: { select: { id: true } } },
      });

      // connect は C(id:3) のみ（B(id:2) は既存なので含まない）
      expect(txArticleUpdate).toHaveBeenCalledTimes(1);
      expect(txArticleUpdate).toHaveBeenCalledWith({
        where: { id: 'article-1' },
        data: {
          tags: {
            connect: [{ id: 3 }],
          },
        },
      });
    });
  });

  describe('tag update is idempotent', () => {
    it('should not call article.update when all tags are already attached', async () => {
      // 既存タグ: A(id:1), B(id:2) がある記事
      const article = makeArticleStub('article-2', [1, 2]);

      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([article]) // articlesWithoutTags
        .mockResolvedValueOnce([]);       // articlesWithOnlyArticleTag

      // Gemini API: A, B を返す（既存と同じ）
      mockGeminiResponse('A, B');

      // getOrCreateTags: A(id:1), B(id:2) を返す（既存と同じ）
      mockGetOrCreateTags.mockResolvedValueOnce([
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ] as any);

      // $transaction コールバック: 現在のタグも A:1, B:2
      const txFindUniqueOrThrow = jest.fn().mockResolvedValue({
        tags: [{ id: 1 }, { id: 2 }],
      });
      const txArticleUpdate = jest.fn().mockResolvedValue({});
      const txClient = {
        article: {
          findUniqueOrThrow: txFindUniqueOrThrow,
          update: txArticleUpdate,
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        (fn: (tx: typeof txClient) => Promise<void>) => fn(txClient)
      );

      await generateTagsForArticles();

      // findUniqueOrThrow は呼ばれる（現在タグの確認は必ず実施）
      expect(txFindUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'article-2' },
        select: { tags: { select: { id: true } } },
      });

      // tagsToConnect が空のため article.update は呼ばれない（冪等性）
      expect(txArticleUpdate).not.toHaveBeenCalled();
    });
  });

  describe('Gemini の呼び出しが 1 件も届かなかった回の判定', () => {
    // console.error を差し替えたテストが途中で落ちても、後のテストに残さない
    let errorSpy: jest.SpyInstance;
    beforeEach(() => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('すべての呼び出しが HTTP エラーなら allGeminiCallsFailed を true にし、状態と状態名をログに出す', async () => {
      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([makeArticleStub('article-3', [])])
        .mockResolvedValueOnce([]);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"error":{"status":"NOT_FOUND"}}',
      } as any);

      const result = await generateTagsForArticles();

      expect(result).toMatchObject({
        generated: 0,
        errors: 1,
        allGeminiCallsFailed: true,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      // 本文はログに出さず、状態コードと状態名だけを出す
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('code=NOT_FOUND status=404')
      );
    });

    it('API キーが無ければ、記事を読む前に失敗で止める', async () => {
      const originalKey = env.GEMINI_API_KEY;
      (env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = undefined;
      try {
        await expect(generateTagsForArticles()).rejects.toThrow(
          'GEMINI_API_KEY is not set'
        );
        expect(prisma.article.findMany).not.toHaveBeenCalled();
      } finally {
        (env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = originalKey;
      }
    });

    it('応答が返っていれば、保存で失敗しても allGeminiCallsFailed は false', async () => {
      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([makeArticleStub('article-4', [])])
        .mockResolvedValueOnce([]);
      mockGeminiResponse('A, B');
      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
        new Error('db error')
      );

      const result = await generateTagsForArticles();

      expect(result).toMatchObject({
        errors: 1,
        allGeminiCallsFailed: false,
      });
    });

    it('依頼が安全性のフィルタで止められたら、理由をログに出して失敗に数える（呼び出しは届いている）', async () => {
      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([makeArticleStub('article-5', [])])
        .mockResolvedValueOnce([]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          promptFeedback: { blockReason: 'PROHIBITED_CONTENT' },
        }),
        text: async () => '',
      } as any);

      const result = await generateTagsForArticles();

      expect(result).toMatchObject({
        generated: 0,
        errors: 1,
        allGeminiCallsFailed: false,
      });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('code=PROHIBITED_CONTENT')
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
