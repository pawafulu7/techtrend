import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixDevToEmptySummaries() {
  console.log('=== Dev.to空要約の修正 ===\n');

  // 問題のある要約パターンを持つ記事を検索
  const problemPatterns = [
    '具体的な記事内容が提示されていない',
    '記事の内容が提供されていない',
    '要約できません',
    '要約を作成できません'
  ];

  const devtoArticles = await prisma.article.findMany({
    where: {
      source: { name: 'Dev.to' },
      summary: { not: null }
    }
  });

  const problemArticles = devtoArticles.filter(article => {
    return problemPatterns.some(pattern => 
      article.summary?.includes(pattern)
    );
  });

  console.log(`問題のある要約を持つ記事: ${problemArticles.length}件`);
  
  if (problemArticles.length > 0) {
    console.log('\n問題のある記事例:');
    problemArticles.slice(0, 5).forEach(article => {
      console.log(`- ${article.title}`);
      console.log(`  現在の要約: ${article.summary}`);
    });

    // 要約をnullにリセット
    const ids = problemArticles.map(a => a.id);
    const result = await prisma.article.updateMany({
      where: {
        id: { in: ids }
      },
      data: {
        summary: null
      }
    });

    console.log(`\n${result.count}件の要約をリセットしました`);
  }

  // contentがnullまたは空の記事も確認
  const emptyContentArticles = await prisma.article.findMany({
    where: {
      source: { name: 'Dev.to' },
      OR: [
        { content: null },
        { content: '' }
      ]
    },
    select: {
      id: true,
      title: true,
      content: true
    }
  });

  console.log(`\ncontentが空の記事: ${emptyContentArticles.length}件`);
  
  if (emptyContentArticles.length > 0) {
    console.log('空のcontent記事例:');
    emptyContentArticles.slice(0, 5).forEach(article => {
      console.log(`- ${article.title}`);
    });
  }
  
  await prisma.$disconnect();
}

fixDevToEmptySummaries().catch(console.error);