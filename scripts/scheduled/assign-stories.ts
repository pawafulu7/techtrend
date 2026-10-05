/**
 * 同じ出来事の記事をストーリーにまとめるバッチ（issue #723）
 *
 * 直近7日の記事をまとめ直し、Article.storyId / storySize を書き込む。
 * 埋め込みの生成の後に実行する（.github/workflows/scheduler-embedding-worker.yml、
 * ローカルは scripts/scheduled/scheduler.ts）。
 *
 * 使い方:
 *   npx tsx scripts/scheduled/assign-stories.ts            # 書き込む
 *   npx tsx scripts/scheduled/assign-stories.ts --dry-run  # 書き込まず、まとまる記事を表示する
 *   --now=2026-09-30T12:00:00Z                             # 期間の終わりを指定する（精度の確認用）
 */
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import {
  assignStories,
  pickStoryRepresentative,
} from '@/lib/services/story-clustering';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const nowArg = process.argv.find((arg) => arg.startsWith('--now='));
  const now = nowArg ? new Date(nowArg.slice('--now='.length)) : undefined;
  if (now && Number.isNaN(now.getTime())) {
    throw new Error(`Invalid --now: ${nowArg}`);
  }
  const startTime = Date.now();

  const result = await assignStories(prisma, { dryRun, now });

  if (dryRun) {
    for (const members of result.groups) {
      const representative = pickStoryRepresentative(members);
      console.error('---');
      for (const m of [...members].sort(
        (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()
      )) {
        const mark = m.id === representative.id ? '*' : ' ';
        console.error(
          `${mark} ${m.publishedAt.toISOString()} ${m.id} ${m.title}`
        );
      }
    }
  }

  logger.info(
    {
      candidates: result.candidates,
      pairs: result.pairs,
      stories: result.stories,
      groupedArticles: result.groupedArticles,
      changed: result.changed,
      dryRun,
      elapsedMs: Date.now() - startTime,
    },
    'Story assignment completed'
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    logger.error({ err: error }, 'Story assignment failed');
    await prisma.$disconnect();
    process.exit(1);
  });
