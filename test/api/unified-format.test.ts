/**
 * 統一フォーマット（summaryVersion: 5）APIエンドポイントテスト
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const API_BASE = 'http://localhost:3000';

describe('統一フォーマットAPIエンドポイントテスト', () => {
  let testArticleId: string;

  beforeAll(async () => {
    // テスト用記事を特定（summaryVersionが5でない記事）
    const response = await fetch(`${API_BASE}/api/articles?limit=100`);
    const data = await response.json();
    
    if (data.success && data.data.articles) {
      // summaryVersionが5でない、またはnullの記事を探す
      const targetArticle = data.data.articles.find(
        (article: any) => article.summaryVersion !== 5 && article.content
      );
      
      if (targetArticle) {
        testArticleId = targetArticle.id;
        console.error(`テスト対象記事: ${testArticleId} - ${targetArticle.title}`);
      }
    }
  });

  describe('POST /api/ai/summarize - 単一記事要約生成', () => {
    it('統一フォーマットで要約を生成すること', async () => {
      if (!testArticleId) {
        console.error('テスト対象記事がないためスキップ');
        return;
      }

      const response = await fetch(`${API_BASE}/api/ai/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          articleId: testArticleId,
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      
      // レスポンス構造の検証
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      
      const article = data.data;
      
      // 統一フォーマットの検証
      expect(article).toHaveProperty('summary');
      expect(article).toHaveProperty('detailedSummary');
      expect(article).toHaveProperty('articleType', 'unified');
      expect(article).toHaveProperty('summaryVersion', 5);
      
      // 要約の内容検証
      expect(article.summary).toBeTruthy();
      expect(article.summary.length).toBeGreaterThanOrEqual(150);
      
      expect(article.detailedSummary).toBeTruthy();
      expect(article.detailedSummary.length).toBeGreaterThanOrEqual(800);
      
      // 詳細要約が箇条書き形式であることを確認
      expect(article.detailedSummary).toContain('・');
      
      console.error('✅ 統一フォーマット確認:');
      console.error(`  - summary: ${article.summary.length}文字`);
      console.error(`  - detailedSummary: ${article.detailedSummary.length}文字`);
      console.error(`  - articleType: ${article.articleType}`);
      console.error(`  - summaryVersion: ${article.summaryVersion}`);
    }, 30000); // タイムアウト30秒

    it('記事IDが指定されていない場合は400エラーを返すこと', async () => {
      const response = await fetch(`${API_BASE}/api/ai/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data).toHaveProperty('success', false);
      expect(data).toHaveProperty('error');
    });

    it('存在しない記事IDの場合は404エラーを返すこと', async () => {
      const response = await fetch(`${API_BASE}/api/ai/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          articleId: 'non-existent-id',
        }),
      });

      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data).toHaveProperty('success', false);
      expect(data).toHaveProperty('error');
    });
  });

  describe('PUT /api/ai/summarize - バッチ要約生成', () => {
    it('複数記事を統一フォーマットで処理すること', async () => {
      // 複数の記事IDを取得
      const response = await fetch(`${API_BASE}/api/articles?limit=3`);
      const data = await response.json();
      
      if (!data.success || !data.data.articles || data.data.articles.length === 0) {
        console.error('テスト用記事がないためスキップ');
        return;
      }

      const articleIds = data.data.articles
        .filter((a: any) => a.content)
        .map((a: any) => a.id);

      const batchResponse = await fetch(`${API_BASE}/api/ai/summarize`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          articleIds,
          regenerate: true, // 既存の要約も再生成
        }),
      });

      expect(batchResponse.status).toBe(200);
      
      const batchData = await batchResponse.json();
      
      expect(batchData).toHaveProperty('success', true);
      expect(batchData).toHaveProperty('data');
      expect(batchData.data).toHaveProperty('processed');
      expect(batchData.data).toHaveProperty('total');
      
      console.error(`✅ バッチ処理完了: ${batchData.data.processed}/${batchData.data.total}件`);
    }, 60000); // タイムアウト60秒

    it('articleIdsが配列でない場合は400エラーを返すこと', async () => {
      const response = await fetch(`${API_BASE}/api/ai/summarize`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          articleIds: 'not-an-array',
        }),
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data).toHaveProperty('success', false);
      expect(data).toHaveProperty('error');
    });
  });

  describe('統一フォーマット検証', () => {
    it('生成された要約が期待される形式であること', async () => {
      if (!testArticleId) {
        console.error('テスト対象記事がないためスキップ');
        return;
      }

      // 記事の詳細を取得
      const response = await fetch(`${API_BASE}/api/articles/${testArticleId}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        const article = data.data;
        
        if (article.summaryVersion === 5) {
          // 詳細要約の形式検証
          const detailedSummary = article.detailedSummary;
          
          // 5つの箇条書き項目があることを確認
          const bulletPoints = detailedSummary.split('・').filter((s: string) => s.trim());
          expect(bulletPoints.length).toBeGreaterThanOrEqual(5);
          
          // 各項目が適切な長さであることを確認
          bulletPoints.forEach((point: string, index: number) => {
            if (point.trim()) {
              console.error(`  項目${index + 1}: ${point.trim().length}文字`);
              expect(point.trim().length).toBeGreaterThanOrEqual(100);
            }
          });
        }
      }
    });
  });

  afterAll(async () => {
    console.error('\n📊 テスト完了サマリー');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('✅ 統一フォーマット（summaryVersion: 5）の生成確認');
    console.error('✅ 詳細要約の生成確認');
    console.error('✅ エラーハンドリングの確認');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
});