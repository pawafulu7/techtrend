import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const domainToSourceMap: Record<string, string> = {
  'developers.freee.co.jp': 'freee_tech_blog',
  'developers.cyberagent.co.jp': 'cyberagent_tech_blog',
  'engineering.dena.com': 'dena_tech_blog',
  'tech.smarthr.jp': 'smarthr_tech_blog',
  'techblog.lycorp.co.jp': 'lycorp_tech_blog',
  'developers.gmo.jp': 'gmo_tech_blog',
  'buildersbox.corp-sansan.com': 'sansan_tech_blog',
  'engineering.mercari.com': 'mercari_tech_blog',
  'techblog.zozo.com': 'zozo_tech_blog',
  'moneyforward-dev.jp': 'moneyforward_tech_blog',
  'developer.hatenastaff.com': 'hatena_tech_blog',
  'tech.pepabo.com': 'pepabo_tech_blog',
  'techlife.cookpad.com': 'cookpad_tech_blog',
};

const HATENA_SOURCE_ID = 'cmdq3nww60000tegxi8ruki95';

async function analyzeImpact() {
  console.log('=== はてなブックマーク経由の企業ブログ記事影響分析 ===\n');

  // 1. Hatena記事総数
  const totalHatena = await prisma.article.count({
    where: { sourceId: HATENA_SOURCE_ID },
  });
  console.log(`1. はてなブックマーク記事総数: ${totalHatena}件\n`);

  // 2. URL取得
  const hatenaArticles = await prisma.article.findMany({
    where: { sourceId: HATENA_SOURCE_ID },
    select: { id: true, url: true, title: true },
  });

  // 3. 企業別集計
  const stats: Record<string, { count: number; sourceId: string }> = {};
  let mappedCount = 0;
  let unmappedCount = 0;

  for (const article of hatenaArticles) {
    try {
      const url = new URL(article.url);
      const domain = url.hostname;
      const corporateSourceId = domainToSourceMap[domain];

      if (corporateSourceId) {
        if (!stats[domain]) {
          stats[domain] = { count: 0, sourceId: corporateSourceId };
        }
        stats[domain].count++;
        mappedCount++;
      } else {
        unmappedCount++;
      }
    } catch (error) {
      unmappedCount++;
    }
  }

  console.log('2. 企業ブログ判定結果:');
  console.log(`   - 企業ブログと判定: ${mappedCount}件 (${((mappedCount / totalHatena) * 100).toFixed(2)}%)`);
  console.log(`   - その他: ${unmappedCount}件 (${((unmappedCount / totalHatena) * 100).toFixed(2)}%)\n`);

  console.log('3. 企業別内訳:');
  const sortedStats = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);
  for (const [domain, { count, sourceId }] of sortedStats) {
    console.log(`   ${sourceId.padEnd(30)} ${count.toString().padStart(5)}件 (${domain})`);
  }

  console.log('\n=== 分析完了 ===');
}

analyzeImpact()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
