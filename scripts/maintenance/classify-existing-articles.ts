import { PrismaClient } from '@prisma/client';
import { detectArticleType } from '@/lib/utils/article-type-detector';

const prisma = new PrismaClient();

interface ClassificationResult {
  total: number;
  classified: number;
  byType: Record<string, number>;
}

async function classifyExistingArticles(): Promise<ClassificationResult> {
  console.log('📊 既存記事の分類を開始します...');
  
  try {
    // summaryVersion = 1 の記事（旧形式）を取得
    const articles = await prisma.article.findMany({
      where: {
        summaryVersion: 1,
        summary: { not: null }
      },
      select: {
        id: true,
        title: true,
        content: true
      }
    });
    
    console.log(`\n📄 分類対象記事数: ${articles.length}件`);
    
    if (articles.length === 0) {
      console.log('✅ すべての記事が既に分類済みです');
      return { total: 0, classified: 0, byType: {} };
    }
    
    const byType: Record<string, number> = {
      'release': 0,
      'problem-solving': 0,
      'tutorial': 0,
      'tech-intro': 0,
      'implementation': 0
    };
    
    let classifiedCount = 0;
    const batchSize = 50;
    
    // バッチ処理で記事を分類
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      console.log(`\n処理中: ${i + 1}-${Math.min(i + batchSize, articles.length)}件目`);
      
      await Promise.all(
        batch.map(async (article) => {
          try {
            // コンテンツを取得
            const content = article.content || '';
            
            // 記事タイプを判定
            const articleType = detectArticleType(article.title, content);
            
            // データベースを更新（記事タイプのみ更新、summaryVersionは変更しない）
            await prisma.article.update({
              where: { id: article.id },
              data: { articleType }
            });
            
            byType[articleType]++;
            classifiedCount++;
            
            console.log(`✓ ${article.title.substring(0, 50)}... → ${articleType}`);
          } catch (error) {
            console.error(`✗ エラー: ${article.id}`, error);
          }
        })
      );
    }
    
    // 結果を表示
    console.log('\n📊 分類結果:');
    console.log('================');
    Object.entries(byType).forEach(([type, count]) => {
      const percentage = articles.length > 0 ? ((count / articles.length) * 100).toFixed(1) : 0;
      console.log(`${type.padEnd(20)}: ${count.toString().padStart(5)}件 (${percentage}%)`);
    });
    console.log('================');
    console.log(`合計: ${classifiedCount}件を分類`);
    
    return {
      total: articles.length,
      classified: classifiedCount,
      byType
    };
    
  } catch (error) {
    console.error('❌ 分類エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  classifyExistingArticles()
    .then((result) => {
      console.log('\n✅ 分類完了');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { classifyExistingArticles };