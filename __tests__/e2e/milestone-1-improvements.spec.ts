import { test, expect } from '@playwright/test';
import pg from 'pg';
import Redis from 'ioredis';
import { loginTestUser } from './utils/e2e-helpers';

async function clearFixtureCaches() {
  if (!process.env.REDIS_URL) throw new Error('Test Redis required');
  const redis = new Redis(process.env.REDIS_URL);
  try {
    for (const pattern of [
      '@techtrend/cache:trend:daily*',
      '@techtrend/cache:trends:heatmap:v4:*',
      '@techtrend/cache:keywords:keywords:trending:v2',
      // KeywordsCache overrides generateKey(), so its runtime key has no namespace.
      'keywords:keywords:trending:v2',
    ]) {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.unlink(...keys);
    }
  } finally {
    await redis.quit();
  }
}

test.describe('マイルストーン1: 表示と集計の回帰検査', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ reducedMotion: 'reduce' });
  let db: pg.Client;
  let sourceId: string;
  let reportId: string;
  let originalReport: { id: string; aiSummary: string | null } | null;
  const prefix = `e2e-m1-${Date.now()}`;

  test.beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url || !/_test$/.test(new URL(url).pathname))
      throw new Error('Test database required');
    db = new pg.Client({ connectionString: url });
    await db.connect();
    sourceId = `${prefix}-source`;
    const articleId = `${prefix}-article`;
    const recentId = `${prefix}-recent`;
    const tagId = `${prefix}-tag`;
    await db.query(
      `INSERT INTO "Source" (id, name, type, url, "updatedAt") VALUES ($1, $2, 'RSS', 'https://example.com/m1', NOW())`,
      [sourceId, prefix]
    );
    await db.query(
      `INSERT INTO "Article" (id, title, url, "sourceId", category, content, "publishedAt", "updatedAt") VALUES ($1, $2, $3, $4, 'ai_ml', 'テスト用本文', $5, NOW())`,
      [
        articleId,
        `${prefix} article`,
        `https://example.com/${prefix}`,
        sourceId,
        new Date(Date.now() - 2 * 86400000),
      ]
    );
    await db.query(
      `INSERT INTO "Article" (id, title, url, "sourceId", "publishedAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        recentId,
        `${prefix} recent article`,
        `https://example.com/${prefix}-recent`,
        sourceId,
        new Date(Date.now() - 60000),
      ]
    );
    await db.query(`INSERT INTO "Tag" (id, name) VALUES ($1, $2)`, [
      tagId,
      `${prefix}-new-tag`,
    ]);
    await db.query(`INSERT INTO "_ArticleToTag" ("A", "B") VALUES ($1, $2)`, [
      recentId,
      tagId,
    ]);
    const start = new Date(Date.now() + 9 * 3600000);
    start.setUTCDate(start.getUTCDate() - 1);
    start.setUTCHours(0, 0, 0, 0);
    const periodStart = new Date(start.getTime() - 9 * 3600000);
    originalReport =
      (
        await db.query<{ id: string; aiSummary: string | null }>(
          `SELECT id, "aiSummary" FROM "TrendReport" WHERE "periodType" = 'DAILY' AND "periodStart" = $1`,
          [periodStart]
        )
      ).rows[0] ?? null;
    const aiSummary = JSON.stringify({
      version: 'trend_ai_summary_v2',
      core: '検証用の発表（A7）',
      overview: '概要（A8）',
      keyTopics: [
        {
          topic: '検証トピック（A7）',
          whatHappened: '設計の更新（A8）',
          whyItMatters: '実装への影響(A7)',
          evidenceArticleIds: [articleId],
        },
      ],
      actions: [
        {
          action: '動作を確認（A8）',
          reason: '検証を進める(A7)',
          articleIds: [articleId],
        },
      ],
    });
    reportId = (
      await db.query<{ id: string }>(
        `
      INSERT INTO "TrendReport" (id, "periodType", "periodStart", "periodEnd", "articleCount", "topArticles", categories, tags, "aiSummary", "updatedAt")
      VALUES ($1, 'DAILY', $2, $3, 1, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $4, NOW())
      ON CONFLICT ("periodType", "periodStart") DO UPDATE SET "aiSummary" = EXCLUDED."aiSummary"
      RETURNING id`,
        [
          `${prefix}-report`,
          periodStart,
          new Date(periodStart.getTime() + 86400000),
          aiSummary,
        ]
      )
    ).rows[0].id;
    await clearFixtureCaches();
  });

  test.afterAll(async () => {
    if (!db) return;
    try {
      if (reportId) {
        if (originalReport)
          await db.query(
            `UPDATE "TrendReport" SET "aiSummary" = $1 WHERE id = $2`,
            [originalReport.aiSummary, reportId]
          );
        else
          await db.query(`DELETE FROM "TrendReport" WHERE id = $1`, [reportId]);
      }
      if (sourceId) {
        await db.query(`DELETE FROM "Article" WHERE "sourceId" = $1`, [
          sourceId,
        ]);
        await db.query(`DELETE FROM "Source" WHERE id = $1`, [sourceId]);
      }
      await db.query(`DELETE FROM "Tag" WHERE name = $1`, [
        `${prefix}-new-tag`,
      ]);
      await clearFixtureCaches();
    } finally {
      await db.end();
    }
  });

  test('セクターマップに内部スラッグを表示しない', async ({ page }, info) => {
    await page.goto('/trends/heatmap');
    await expect(
      page.getByText('AI/機械学習', { exact: true }).first()
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      /\b(ai_ml|frontend|backend|infrastructure|database)\b/
    );
    await page.screenshot({
      path: info.outputPath('heatmap.png'),
      fullPage: true,
    });
  });

  test('プロフィールに provider ID を表示せず認証方法を重複させない', async ({
    page,
  }, info) => {
    expect(await loginTestUser(page)).toBe(true);
    await page.goto('/profile');
    await expect(
      page.getByText('メール/パスワード', { exact: true })
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/\bcredentials?\b/);
    await expect(page.getByText('X（Twitter）', { exact: true })).toBeVisible();
    await page.screenshot({
      path: info.outputPath('profile.png'),
      fullPage: true,
    });
  });

  test('既存デイリー本文の参照 ID を表示せず関連記事を保持する', async ({
    page,
  }, info) => {
    await page.goto('/trends/daily');
    await expect(page.getByText('検証用の発表', { exact: true })).toBeVisible();
    // The app scrolls inside <main>; reveal the report before taking the screenshot.
    await page
      .getByText('検証用の発表', { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText('検証用の発表', { exact: true })
    ).toBeInViewport();
    await expect(page.locator('body')).not.toContainText(/[（(\[]A\d+[）)\]]/);
    await expect(page.getByText('関連記事 1件', { exact: true })).toBeVisible();
    await page.screenshot({
      path: info.outputPath('daily.png'),
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('人気画面から投票を撤去し、旧 URL でも総合指標を表示する', async ({
    page,
  }, info) => {
    await page.goto('/popular?metric=votes');
    await expect(
      page.getByRole('tab', { name: '総合', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('tab', { name: '元サイトの反応', exact: true })
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('投票');
    await expect(
      page.getByText(/指標の意味はソースごとに異なります/)
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath('popular.png'),
      fullPage: true,
    });
  });

  test('新着タグ API の 10 並列・20 リクエストはすべて成功する', async ({
    request,
  }) => {
    let next = 0;
    const statuses: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        while (next++ < 20)
          statuses.push((await request.get('/api/tags/new?days=7')).status());
      })
    );
    expect(statuses).toHaveLength(20);
    expect(statuses.every((status) => status === 200)).toBe(true);
    const tags = await request
      .get('/api/tags/new?days=1')
      .then((r) => r.json());
    const trends = await request
      .get('/api/trends/keywords')
      .then((r) => r.json());
    expect(
      tags.tags.some(
        (tag: { name: string }) => tag.name === `${prefix}-new-tag`
      )
    ).toBe(true);
    expect(
      tags.tags
        .slice(0, 10)
        .map((tag: { id: string; name: string; articleCount: number }) => ({
          id: tag.id,
          name: tag.name,
          count: tag.articleCount,
        }))
    ).toEqual(trends.newTags);
  });
});
