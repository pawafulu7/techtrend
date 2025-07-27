import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateAWSArticles() {
  console.log('AWS記事の移行を開始します...');

  try {
    // 新しい統合AWSソースを取得
    const unifiedSource = await prisma.source.findFirst({
      where: { name: 'AWS', enabled: true }
    });

    if (!unifiedSource) {
      throw new Error('統合AWSソースが見つかりません');
    }

    // 既存の3つのAWSソースを取得
    const oldSources = await prisma.source.findMany({
      where: {
        name: {
          in: ['AWS Security Bulletins', 'AWS What\'s New', 'AWS News Blog']
        }
      }
    });

    if (oldSources.length === 0) {
      console.log('移行する記事がありません');
      return;
    }

    const oldSourceIds = oldSources.map(s => s.id);
    console.log(`移行対象ソース: ${oldSources.map(s => s.name).join(', ')}`);

    // 既存記事を新しいソースに移行
    const result = await prisma.article.updateMany({
      where: {
        sourceId: { in: oldSourceIds }
      },
      data: {
        sourceId: unifiedSource.id
      }
    });

    console.log(`✅ ${result.count}件の記事を統合AWSソースに移行しました`);

    // 古いソースを削除
    await prisma.source.deleteMany({
      where: {
        id: { in: oldSourceIds }
      }
    });

    console.log('✅ 古いAWSソースを削除しました');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateAWSArticles().catch(console.error);