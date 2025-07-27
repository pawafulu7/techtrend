const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTruncatedSummaries() {
  try {
    // 「なっ」「でき」「なり」など、文末が不自然な要約を探す
    const truncatedPatterns = [
      { pattern: 'っ', desc: '「っ」で終わる' },
      { pattern: 'き', desc: '「き」で終わる' },
      { pattern: 'り', desc: '「り」で終わる' },
      { pattern: 'を', desc: '「を」で終わる' },
      { pattern: 'に', desc: '「に」で終わる' },
      { pattern: 'で', desc: '「で」で終わる' },
      { pattern: 'が', desc: '「が」で終わる' },
      { pattern: 'は', desc: '「は」で終わる' },
      { pattern: 'と', desc: '「と」で終わる' },
      { pattern: 'の', desc: '「の」で終わる' },
    ];

    console.log('=== 途切れている可能性のある要約パターン ===\n');
    
    let totalTruncated = 0;
    const allTruncated = [];

    for (const { pattern, desc } of truncatedPatterns) {
      const articles = await prisma.article.findMany({
        where: {
          AND: [
            { summary: { endsWith: pattern } },
            { summary: { not: { endsWith: '。' } } }
          ]
        },
        include: {
          source: true
        },
        orderBy: {
          publishedAt: 'desc'
        }
      });

      if (articles.length > 0) {
        console.log(`\n${desc}: ${articles.length}件`);
        articles.slice(0, 3).forEach((article, index) => {
          console.log(`  ${index + 1}. ${article.source.name} - ${article.title.substring(0, 40)}...`);
          console.log(`     要約(${article.summary.length}文字): ${article.summary}`);
        });
        totalTruncated += articles.length;
        allTruncated.push(...articles);
      }
    }

    console.log(`\n\n=== 統計 ===`);
    console.log(`途切れている可能性のある要約: ${totalTruncated}件`);

    // 文字数でグループ化
    const byLength = {};
    allTruncated.forEach(article => {
      const len = article.summary.length;
      byLength[len] = (byLength[len] || 0) + 1;
    });

    console.log('\n文字数別の分布:');
    Object.keys(byLength).sort((a, b) => Number(b) - Number(a)).slice(0, 10).forEach(len => {
      console.log(`  ${len}文字: ${byLength[len]}件`);
    });

    // 特定の記事を詳しく調べる
    const targetArticle = await prisma.article.findFirst({
      where: {
        title: {
          contains: '基幹システム移行'
        }
      },
      include: {
        source: true
      }
    });

    if (targetArticle) {
      console.log('\n\n=== 特定記事の詳細 ===');
      console.log(`タイトル: ${targetArticle.title}`);
      console.log(`ソース: ${targetArticle.source.name}`);
      console.log(`要約(${targetArticle.summary.length}文字): ${targetArticle.summary}`);
      console.log(`URLの最初の100文字: ${targetArticle.url}`);
    }

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTruncatedSummaries();