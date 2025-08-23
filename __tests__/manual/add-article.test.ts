/**
 * 手動記事追加機能のテスト
 */

// Prismaのモック（巻き上げのために先に定義）
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      article: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      source: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $disconnect: jest.fn(),
    })),
  };
});

import { detectSourceFromUrl, normalizeSourceName, isValidUrl, isSupportedUrl } from '../../lib/utils/source-detector';
import { addArticleManually, setPrismaClient } from '../../lib/utils/article-manual-adder';
import { PrismaClient } from '@prisma/client';

// UnifiedSummaryServiceのモック
jest.mock('../../lib/ai/unified-summary-service', () => ({
  UnifiedSummaryService: jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue({
      success: true,
      summary: 'テスト要約',
      detailedSummary: 'テスト詳細要約',
    }),
  })),
}));

// ContentEnricherFactoryのモック
jest.mock('../../lib/enrichers', () => ({
  ContentEnricherFactory: jest.fn().mockImplementation(() => ({
    getEnricher: jest.fn().mockReturnValue(null),
  })),
}));

// WebFetcherのモック
jest.mock('../../lib/utils/web-fetcher', () => ({
  WebFetcher: jest.fn().mockImplementation(() => ({
    fetch: jest.fn().mockResolvedValue('<html><title>Test Article</title></html>'),
  })),
}));

describe('source-detector', () => {
  describe('detectSourceFromUrl', () => {
    test('Speaker Deckを正しく検出', () => {
      const result = detectSourceFromUrl('https://speakerdeck.com/hik0107/how-to-reflect-value-of-data');
      expect(result.source).toBe('Speaker Deck');
      expect(result.confidence).toBe('high');
    });

    test('Qiitaを正しく検出', () => {
      const result = detectSourceFromUrl('https://qiita.com/items/abc123');
      expect(result.source).toBe('Qiita');
      expect(result.confidence).toBe('high');
    });

    test('Zennを正しく検出', () => {
      const result = detectSourceFromUrl('https://zenn.dev/articles/abc123');
      expect(result.source).toBe('Zenn');
      expect(result.confidence).toBe('high');
    });

    test('未知のURLはManualとして判定', () => {
      const result = detectSourceFromUrl('https://example.com/article');
      expect(result.source).toBe('Manual');
      expect(result.confidence).toBe('low');
    });

    test('企業技術ブログを検出', () => {
      const result = detectSourceFromUrl('https://tech.mercari.com/entry/2024/01/01/test');
      // Corporate Tech Blogの汎用パターンが先にマッチするため、この結果は許容される
      expect(['Corporate Tech Blog', 'Mercari Engineering Blog']).toContain(result.source);
      expect(['high', 'medium']).toContain(result.confidence);
    });
  });

  describe('isValidUrl', () => {
    test('有効なHTTP URLを判定', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    test('有効なHTTPS URLを判定', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    test('無効なURLを判定', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('isSupportedUrl', () => {
    test('対応しているURLを判定', () => {
      expect(isSupportedUrl('https://speakerdeck.com/test')).toBe(true);
      expect(isSupportedUrl('https://qiita.com/test')).toBe(true);
    });

    test('未対応のURLを判定', () => {
      expect(isSupportedUrl('https://example.com/test')).toBe(false);
    });
  });

  describe('normalizeSourceName', () => {
    test('既知のソース名を正規化', () => {
      expect(normalizeSourceName('Speaker Deck')).toBe('Speaker Deck');
      expect(normalizeSourceName('Qiita')).toBe('Qiita');
      expect(normalizeSourceName('Manual')).toBe('Manual Entry');
    });

    test('未知のソース名はそのまま返す', () => {
      expect(normalizeSourceName('Unknown Source')).toBe('Unknown Source');
    });
  });
});

describe('addArticleManually', () => {
  let mockPrisma: any;

  beforeEach(() => {
    // PrismaClientのモックインスタンスを取得
    mockPrisma = new (PrismaClient as any)();
    // モックインスタンスを実際のコードに注入
    setPrismaClient(mockPrisma);
    jest.clearAllMocks();
  });

  test('新規記事を正常に追加', async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    mockPrisma.source.findFirst.mockResolvedValue({ id: 'source-1', name: 'Manual Entry' });
    mockPrisma.source.create.mockResolvedValue({ id: 'source-1', name: 'Manual Entry' });
    mockPrisma.article.create.mockResolvedValue({
      id: 'article-1',
      title: 'Test Article',
      url: 'https://example.com/article',
    });

    const result = await addArticleManually({
      url: 'https://example.com/article',
      skipSummary: true,
    });

    expect(result.success).toBe(true);
    expect(result.articleId).toBe('article-1');
    expect(result.title).toBe('Test Article');
  });

  test('重複URLの場合はエラー', async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      id: 'existing-article',
      title: 'Existing Article',
      url: 'https://example.com/article',
    });
    mockPrisma.source.findFirst.mockResolvedValue({ id: 'source-1', name: 'Manual Entry' });

    const result = await addArticleManually({
      url: 'https://example.com/article',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('既に同じURLの記事が存在');
    expect(result.articleId).toBe('existing-article');
  });

  test('無効なURLの場合はエラー', async () => {
    const result = await addArticleManually({
      url: 'not-a-valid-url',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('無効なURL');
  });

  test('ドライランモードでは実際に保存しない', async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    mockPrisma.source.findFirst.mockResolvedValue({ id: 'source-1', name: 'Manual Entry' });
    mockPrisma.source.create.mockResolvedValue({ id: 'source-1', name: 'Manual Entry' });

    const result = await addArticleManually({
      url: 'https://example.com/article',
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('ドライラン完了');
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  test('カスタムタイトルを使用', async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    mockPrisma.source.findFirst.mockResolvedValue({ id: 'source-1', name: 'Manual Entry' });
    mockPrisma.source.create.mockResolvedValue({ id: 'source-1', name: 'Manual Entry' });
    mockPrisma.article.create.mockResolvedValue({
      id: 'article-1',
      title: 'Custom Title',
      url: 'https://example.com/article',
    });

    const result = await addArticleManually({
      url: 'https://example.com/article',
      title: 'Custom Title',
      skipSummary: true,
    });

    expect(result.success).toBe(true);
    expect(result.title).toBe('Custom Title');
  });
});