import { createPrismaClient } from '@/lib/prisma/create-client';

const prisma = createPrismaClient();

async function verifyCleanup() {
  try {
    let success = true;
    
    // articleタグが存在しないことを確認
    const articleTag = await prisma.tag.findFirst({
      where: { name: 'article' }
    });
    
    if (articleTag) {
      console.error('❌ articleタグがまだ存在します');
      success = false;
    } else {
      console.error('✅ articleタグは正常に削除されています');
    }
    
    // book, scrapタグは残っていることを確認
    const bookTag = await prisma.tag.findFirst({
      where: { name: 'book' }
    });
    
    const scrapTag = await prisma.tag.findFirst({
      where: { name: 'scrap' }
    });
    
    if (bookTag) {
      console.error('✅ bookタグは正常に存在します');
    } else {
      console.error('ℹ️  bookタグは存在しません（まだ該当記事がない可能性）');
    }
    
    if (scrapTag) {
      console.error('✅ scrapタグは正常に存在します');
    } else {
      console.error('ℹ️  scrapタグは存在しません（まだ該当記事がない可能性）');
    }
    
    // タグ統計を表示
    const tagCount = await prisma.tag.count();
    console.error(`\n📊 現在のタグ総数: ${tagCount}件`);
    
    // 人気タグTop5を表示
    const popularTags = await prisma.tag.findMany({
      take: 5,
      orderBy: {
        articles: {
          _count: 'desc'
        }
      },
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });
    
    console.error('\n🏆 人気タグTop5:');
    popularTags.forEach((tag, index) => {
      console.error(`  ${index + 1}. ${tag.name} (${tag._count.articles}件)`);
    });
    
    return success;
  } catch (error) {
    console.error('❌ 検証中にエラーが発生しました:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

verifyCleanup();