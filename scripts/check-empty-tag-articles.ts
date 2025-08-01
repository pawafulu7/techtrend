import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEmptyTagArticles() {
  console.log('空のタグが設定されている記事を調査中...\n');
  
  try {
    // 空のタグを取得
    const emptyTag = await prisma.tag.findFirst({
      where: {
        name: ''
      }
    });
    
    if (!emptyTag) {
      console.log('空のタグは見つかりませんでした。');
      return;
    }
    
    console.log(`空のタグ情報:`);
    console.log(`  ID: ${emptyTag.id}`);
    console.log(`  名前: "${emptyTag.name}"\n`);
    
    // 空のタグが関連付けられている記事を取得
    const articles = await prisma.article.findMany({
      where: {
        tags: {
          some: {
            id: emptyTag.id
          }
        }
      },
      include: {
        source: true,
        tags: true
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log(`【空のタグが設定されている記事】: ${articles.length}件`);
    console.log('='.repeat(80));
    
    articles.forEach((article, index) => {
      const date = article.publishedAt.toISOString().split('T')[0];
      const otherTags = article.tags
        .filter(tag => tag.id !== emptyTag.id)
        .map(tag => tag.name)
        .join(', ');
      
      console.log(`\n${index + 1}. [${date}] ${article.source.name}`);
      console.log(`   タイトル: ${article.title.substring(0, 60)}...`);
      console.log(`   すべてのタグ: ${article.tags.map(t => `"${t.name}"`).join(', ')}`);
      console.log(`   他のタグ: ${otherTags || 'なし'}`);
      console.log(`   記事ID: ${article.id}`);
    });
    
    // 空のタグを削除する推奨事項
    console.log('\n【推奨アクション】');
    console.log('='.repeat(80));
    console.log('1. 空のタグを記事から切り離す');
    console.log('2. 空のタグを削除する');
    console.log('3. タグ生成ロジックの確認と改善');
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEmptyTagArticles();