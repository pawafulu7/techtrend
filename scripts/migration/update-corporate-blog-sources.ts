#!/usr/bin/env -S npx tsx

import { PrismaClient, Prisma } from '@prisma/client';
import logger from '@/lib/logger';

const prisma = new PrismaClient();

// 企業名タグとソースIDのマッピング
const COMPANY_SOURCE_MAPPING: Record<string, string> = {
  'DeNA': 'dena_tech_blog',
  'SmartHR': 'smarthr_tech_blog',
  'LINEヤフー': 'lycorp_tech_blog',
  'メルカリ': 'mercari_tech_blog',
  'Sansan': 'sansan_tech_blog',
  'ZOZO': 'zozo_tech_blog',
  'はてなDeveloper': 'hatena_tech_blog',
  'マネーフォワード': 'moneyforward_tech_blog',
  'GMOペパボ': 'pepabo_tech_blog',
  'freee': 'freee_tech_blog',
  'クックパッド': 'cookpad_tech_blog',
  'サイバーエージェント': 'cyberagent_tech_blog',
  'GMO': 'gmo_tech_blog',
  // Yahoo! JAPANとリクルートは個別ソースが存在しない場合の追加予定
};

const CORPORATE_BLOG_SOURCE_ID = 'cmdwgsk1b0000te2vrjnpm6gc';
const BATCH_SIZE = 10;

interface UpdateOptions {
  dryRun: boolean;
  backup: boolean;
}

interface UpdateResult {
  articleId: string;
  title: string;
  oldSourceId: string;
  newSourceId: string;
  companyTag: string;
}

interface ArticleToUpdate {
  articleId: string;
  title: string;
  sourceId: string;
  tags: (string | null)[];
}

/**
 * バックアップテーブル作成
 */
async function createBackup(): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupTableName = `article_backup_${timestamp}`;

  logger.info(`Creating backup table: ${backupTableName}`);

  // テーブル名は英数/アンダースコア/ハイフンのみ許可
  if (!/^[A-Za-z0-9_-]+$/.test(backupTableName)) {
    throw new Error(`Invalid backup table name: ${backupTableName}`);
  }

  // Prisma.sqlとPrisma.rawを使用してSQLインジェクション対策
  await prisma.$executeRaw(
    Prisma.sql`CREATE TABLE IF NOT EXISTS ${Prisma.raw('"' + backupTableName + '"')} AS
      SELECT * FROM "Article"
      WHERE "sourceId" = ${CORPORATE_BLOG_SOURCE_ID}`
  );

  const count = await prisma.$queryRaw<{count: bigint}[]>(
    Prisma.sql`SELECT COUNT(*) as count FROM ${Prisma.raw('"' + backupTableName + '"')}`
  );

  logger.success(`Backup created: ${backupTableName} with ${count[0].count} records`);
}

/**
 * 更新対象の記事を取得
 */
async function getArticlesToUpdate(): Promise<ArticleToUpdate[]> {
  const articles = await prisma.$queryRaw<ArticleToUpdate[]>`
    SELECT
      a.id as "articleId",
      a.title,
      a."sourceId",
      array_agg(t.name ORDER BY t.name) as tags
    FROM "Article" a
    LEFT JOIN "_ArticleToTag" at ON a.id = at."A"
    LEFT JOIN "Tag" t ON at."B" = t.id
    WHERE a."sourceId" = ${CORPORATE_BLOG_SOURCE_ID}
    GROUP BY a.id, a.title, a."sourceId", a."publishedAt"
    ORDER BY a."publishedAt" DESC
  `;

  return articles;
}

/**
 * 記事の企業タグを特定（長い/特異なタグを優先）
 */
function identifyCompanyTag(tags: string[]): string | null {
  if (!tags || tags.length === 0) return null;

  const normalize = (s: string) => s.normalize('NFKC').trim().toLowerCase();
  const set = new Set(tags.filter(Boolean).map(t => normalize(t)));
  // より特異的（長い）タグを優先するため、長さでソート
  const candidates = Object.keys(COMPANY_SOURCE_MAPPING).sort((a, b) => b.length - a.length);

  for (const key of candidates) {
    if (set.has(normalize(key))) return key;
  }

  return null;
}

// N+1クエリ回避のため、validateSourceExists関数は削除し、先読みに変更

/**
 * 記事のソースID更新処理
 */
async function updateArticleSources(options: UpdateOptions): Promise<void> {
  logger.info('Starting corporate blog source update...');

  // バックアップ作成
  if (options.backup && !options.dryRun) {
    await createBackup();
  }

  // 更新対象記事の取得
  const articles = await getArticlesToUpdate();
  logger.info(`Found ${articles.length} articles to process`);

  // 既存ソースIDを先読み（N+1回避）
  const existingSourceIds = new Set(
    (await prisma.source.findMany({
      where: { id: { in: Object.values(COMPANY_SOURCE_MAPPING) } },
      select: { id: true },
    })).map(s => s.id)
  );

  const updateResults: UpdateResult[] = [];
  const skippedArticles: any[] = [];
  const errors: any[] = [];

  // バッチ処理
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, Math.min(i + BATCH_SIZE, articles.length));
    logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(articles.length / BATCH_SIZE)}`);

    for (const article of batch) {
      try {
        const companyTag = identifyCompanyTag(article.tags);

        if (!companyTag) {
          skippedArticles.push({
            articleId: article.articleId,
            title: article.title,
            reason: 'No company tag found'
          });
          continue;
        }

        const newSourceId = COMPANY_SOURCE_MAPPING[companyTag];

        // ソースIDの存在確認（先読みSet利用）
        if (!existingSourceIds.has(newSourceId)) {
          skippedArticles.push({
            articleId: article.articleId,
            title: article.title,
            reason: `Source ${newSourceId} does not exist`
          });
          continue;
        }

        // 更新実行またはドライラン
        if (options.dryRun) {
          logger.info(`[DRY RUN] Would update article ${article.articleId}: ${article.sourceId} -> ${newSourceId} (${companyTag})`);
        } else {
          await prisma.article.update({
            where: { id: article.articleId },
            data: { sourceId: newSourceId }
          });
          logger.success(`Updated article ${article.articleId}: ${article.sourceId} -> ${newSourceId} (${companyTag})`);
        }

        updateResults.push({
          articleId: article.articleId,
          title: article.title,
          oldSourceId: article.sourceId,
          newSourceId: newSourceId,
          companyTag: companyTag
        });

      } catch (error) {
        logger.error(`Error processing article ${article.articleId}:`, error);
        errors.push({
          articleId: article.articleId,
          title: article.title,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  // 結果サマリー出力
  logger.info('\n=== Update Summary ===');
  logger.info(`Total articles processed: ${articles.length}`);
  logger.info(`Successfully updated: ${updateResults.length}`);
  logger.info(`Skipped: ${skippedArticles.length}`);
  logger.info(`Errors: ${errors.length}`);

  if (skippedArticles.length > 0) {
    logger.info('\n=== Skipped Articles ===');
    skippedArticles.forEach(article => {
      logger.info(`- ${article.title} (${article.reason})`);
    });
  }

  if (errors.length > 0) {
    logger.info('\n=== Errors ===');
    errors.forEach(err => {
      logger.info(`- ${err.title}: ${err.error}`);
    });
  }

  // 企業別の更新数を集計
  const updatesByCompany = updateResults.reduce((acc, result) => {
    acc[result.companyTag] = (acc[result.companyTag] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  logger.info('\n=== Updates by Company ===');
  Object.entries(updatesByCompany).forEach(([company, count]) => {
    logger.info(`- ${company}: ${count} articles`);
  });
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);
  const options: UpdateOptions = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    backup: !args.includes('--no-backup')
  };

  if (options.dryRun) {
    logger.warn('Running in DRY RUN mode - no changes will be made');
  }

  try {
    await updateArticleSources(options);
    logger.info('Corporate blog source update completed successfully');
  } catch (error) {
    logger.error('Fatal error during update:', error);
    throw error; // rethrowしてfinallyブロックを確実に実行
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { updateArticleSources, COMPANY_SOURCE_MAPPING };