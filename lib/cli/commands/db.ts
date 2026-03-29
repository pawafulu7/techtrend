import { Command } from 'commander';
import { getPrismaClient, closePrismaClient } from '../utils/database';
import { logger } from '../utils/logger';

export const dbCommand = new Command('db').description(
  'データベースの管理・統計'
);

dbCommand
  .command('stats')
  .description('主要テーブルの件数と最新記事日時を表示')
  .action(async () => {
    const prisma = getPrismaClient();
    try {
      // 主要テーブルの統計取得（並列実行）
      // NOTE: スキーマにモデル追加時はこのリストも更新すること
      const tables = [
        { name: 'Article', query: () => prisma.article.count() },
        { name: 'Source', query: () => prisma.source.count() },
        { name: 'Tag', query: () => prisma.tag.count() },
        { name: 'User', query: () => prisma.user.count() },
        { name: 'Favorite', query: () => prisma.favorite.count() },
        { name: 'ArticleView', query: () => prisma.articleView.count() },
        { name: 'TrendReport', query: () => prisma.trendReport.count() },
        { name: 'Comment', query: () => prisma.comment.count() },
        {
          name: 'ArticleEmbedding',
          query: () => prisma.articleEmbedding.count(),
        },
      ];

      const results = await Promise.all(
        tables.map(async (t) => ({
          name: t.name,
          count: await t.query(),
        }))
      );

      // 最新記事の日時取得
      const latestArticle = await prisma.article.findFirst({
        orderBy: { publishedAt: 'desc' },
        select: { publishedAt: true },
      });

      // テーブル形式で出力（統計はstdoutに直接出力、エラーはlogger経由）
      console.log('\n=== TechTrend DB Statistics ===\n');
      console.log('Table'.padEnd(22) + 'Count'.padStart(10));
      console.log('-'.repeat(32));
      for (const r of results) {
        console.log(r.name.padEnd(22) + r.count.toString().padStart(10));
      }
      console.log('-'.repeat(32));
      if (latestArticle?.publishedAt) {
        console.log(
          `\nLatest article: ${latestArticle.publishedAt.toISOString()}`
        );
      }
      logger.success('DB統計取得完了');
    } catch (error) {
      logger.error('DB統計取得に失敗しました', error);
      process.exitCode = 1;
      return;
    } finally {
      await closePrismaClient();
    }
  });
