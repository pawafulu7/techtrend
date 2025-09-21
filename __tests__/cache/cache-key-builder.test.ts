/**
 * CacheKeyBuilder ラウンドトリップテスト
 * codex推奨: キー構築・分解の一貫性確認
 */

import { CacheKeyBuilder } from '@/lib/dataloader/cache-key-builder';

describe('CacheKeyBuilder', () => {
  describe('基本的なキー構築・分解', () => {
    test('通常のユーザーID・記事IDでラウンドトリップできる', () => {
      const userId = 'user123';
      const articleId = 'article456';

      const compositeKey = CacheKeyBuilder.buildUserArticleKey(userId, articleId);
      const parsed = CacheKeyBuilder.parseUserArticleKey(compositeKey);

      expect(parsed).not.toBeNull();
      expect(parsed!.userId).toBe(userId);
      expect(parsed!.articleId).toBe(articleId);
    });

    test('UUIDでのラウンドトリップができる', () => {
      const userId = 'cmefp5z2m0001tem5epun8j6q';
      const articleId = 'cms1x2y3z4001abc5def6ghi';

      const compositeKey = CacheKeyBuilder.buildUserArticleKey(userId, articleId);
      const parsed = CacheKeyBuilder.parseUserArticleKey(compositeKey);

      expect(parsed).not.toBeNull();
      expect(parsed!.userId).toBe(userId);
      expect(parsed!.articleId).toBe(articleId);
    });
  });

  describe('エッジケース: コロンを含むID', () => {
    test('ユーザーIDにコロンが含まれる場合', () => {
      const userId = 'external:user:123';
      const articleId = 'article456';

      const compositeKey = CacheKeyBuilder.buildUserArticleKey(userId, articleId);
      const parsed = CacheKeyBuilder.parseUserArticleKey(compositeKey);

      expect(parsed).not.toBeNull();
      expect(parsed!.userId).toBe(userId);
      expect(parsed!.articleId).toBe(articleId);
    });

    test('記事IDにコロンが含まれる場合（スラグなど）', () => {
      const userId = 'user123';
      const articleId = '2024:05:tech-trends';

      const compositeKey = CacheKeyBuilder.buildUserArticleKey(userId, articleId);
      const parsed = CacheKeyBuilder.parseUserArticleKey(compositeKey);

      expect(parsed).not.toBeNull();
      expect(parsed!.userId).toBe(userId);
      expect(parsed!.articleId).toBe(articleId);
    });

    test('両方のIDにコロンが含まれる場合', () => {
      const userId = 'external:user:123';
      const articleId = '2024:05:tech-trends';

      const compositeKey = CacheKeyBuilder.buildUserArticleKey(userId, articleId);
      const parsed = CacheKeyBuilder.parseUserArticleKey(compositeKey);

      expect(parsed).not.toBeNull();
      expect(parsed!.userId).toBe(userId);
      expect(parsed!.articleId).toBe(articleId);
    });

    test('連続するコロンが含まれる場合', () => {
      const userId = 'user::with::double::colons';
      const articleId = 'article::id::test';

      const compositeKey = CacheKeyBuilder.buildUserArticleKey(userId, articleId);
      const parsed = CacheKeyBuilder.parseUserArticleKey(compositeKey);

      expect(parsed).not.toBeNull();
      expect(parsed!.userId).toBe(userId);
      expect(parsed!.articleId).toBe(articleId);
    });
  });

  describe('バッチ処理ヘルパー', () => {
    test('バッチキー構築', () => {
      const userId = 'user123';
      const articleIds = ['article1', 'article2', 'article3'];

      const compositeKeys = CacheKeyBuilder.buildBatchKeys(userId, articleIds);

      expect(compositeKeys).toHaveLength(3);
      compositeKeys.forEach((key, index) => {
        const parsed = CacheKeyBuilder.parseUserArticleKey(key);
        expect(parsed).not.toBeNull();
        expect(parsed!.userId).toBe(userId);
        expect(parsed!.articleId).toBe(articleIds[index]);
      });
    });

    test('記事ID抽出', () => {
      const userId = 'user123';
      const articleIds = ['article1', 'article2', 'article3'];
      const compositeKeys = CacheKeyBuilder.buildBatchKeys(userId, articleIds);

      const extractedIds = CacheKeyBuilder.extractArticleIds(compositeKeys);

      expect(extractedIds).toEqual(articleIds);
    });

    test('結果マッピング', () => {
      const userId = 'user123';
      const articleResults = new Map([
        ['article1', { data: 'result1' }],
        ['article2', { data: 'result2' }],
      ]);

      const mappedResults = CacheKeyBuilder.mapResults(userId, articleResults);

      expect(mappedResults.size).toBe(2);

      const key1 = CacheKeyBuilder.buildUserArticleKey(userId, 'article1');
      const key2 = CacheKeyBuilder.buildUserArticleKey(userId, 'article2');

      expect(mappedResults.get(key1)).toEqual({ data: 'result1' });
      expect(mappedResults.get(key2)).toEqual({ data: 'result2' });
    });
  });

  describe('ユーザーパターン', () => {
    test('ユーザーパターン構築', () => {
      const userId = 'user123';
      const pattern = CacheKeyBuilder.buildUserPattern(userId);

      expect(pattern).toBe('7:user123:*');
    });

    test('コロンを含むユーザーIDのパターン', () => {
      const userId = 'external:user:123';
      const pattern = CacheKeyBuilder.buildUserPattern(userId);

      expect(pattern).toBe('17:external:user:123:*');
    });
  });

  describe('エラーケース', () => {
    test('無効なキーフォーマット', () => {
      const invalidKey = 'invalid-key-without-separator';
      const parsed = CacheKeyBuilder.parseUserArticleKey(invalidKey);

      expect(parsed).toBeNull();
    });

    test('空文字列', () => {
      const parsed = CacheKeyBuilder.parseUserArticleKey('');

      expect(parsed).toBeNull();
    });

    test('不正な形式（セパレータのみ）', () => {
      const parsed = CacheKeyBuilder.parseUserArticleKey(':');

      expect(parsed).toBeNull();
    });
  });
});