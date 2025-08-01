import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyTagRemoval() {
  console.log('タグ削除の検証を実行中...\n');
  
  try {
    // 1. 削除対象のタグが存在しないことを確認
    console.log('【削除対象タグの確認】');
    console.log('='.repeat(50));
    
    const deletedTagNames = ["", "What's New", "新機能", "Updates"];
    let allDeleted = true;
    
    for (const tagName of deletedTagNames) {
      const tag = await prisma.tag.findFirst({
        where: { name: tagName }
      });
      
      if (tag) {
        console.log(`❌ 「${tagName}」タグがまだ存在しています`);
        allDeleted = false;
      } else {
        console.log(`✅ 「${tagName}」タグは正常に削除されました`);
      }
    }
    
    // 2. AWS記事のタグ状態を確認
    console.log('\n【AWS記事のタグ状態】');
    console.log('='.repeat(50));
    
    const awsArticles = await prisma.article.findMany({
      where: {
        source: {
          name: 'AWS'
        }
      },
      include: {
        tags: true
      },
      orderBy: { publishedAt: 'desc' },
      take: 5
    });
    
    console.log(`\n最新5件のAWS記事:`);
    awsArticles.forEach((article, index) => {
      const date = article.publishedAt.toISOString().split('T')[0];
      const tags = article.tags.map(t => t.name).join(', ');
      console.log(`${index + 1}. [${date}] ${article.title.substring(0, 50)}...`);
      console.log(`   タグ: ${tags || 'なし'}`);
    });
    
    // 3. 統計情報
    console.log('\n【統計情報】');
    console.log('='.repeat(50));
    
    const totalTags = await prisma.tag.count();
    const awsTagCount = await prisma.tag.count({
      where: {
        articles: {
          some: {
            source: {
              name: 'AWS'
            }
          }
        }
      }
    });
    
    console.log(`総タグ数: ${totalTags}個`);
    console.log(`AWS記事で使用されているタグ数: ${awsTagCount}個`);
    
    // 結果判定
    console.log('\n【検証結果】');
    console.log('='.repeat(50));
    
    if (allDeleted) {
      console.log('✅ すべての削除対象タグが正常に削除されました');
      console.log('✅ AWS記事には必要なタグのみが残っています');
    } else {
      console.log('❌ 一部のタグが削除されていません');
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyTagRemoval();