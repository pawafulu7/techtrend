import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAWSSpecificTags() {
  console.log('AWS関連タグの使用状況を調査中...\n');
  
  try {
    // 調査対象のタグ
    const targetTags = ["What's New", "新機能", "Updates"];
    const results: any[] = [];
    
    for (const tagName of targetTags) {
      const tag = await prisma.tag.findFirst({
        where: { name: tagName },
        include: {
          _count: {
            select: { articles: true }
          }
        }
      });
      
      if (!tag) {
        console.log(`❌ 「${tagName}」タグは見つかりませんでした。`);
        continue;
      }
      
      // タグが設定されている記事を取得
      const articles = await prisma.article.findMany({
        where: {
          tags: {
            some: {
              id: tag.id
            }
          }
        },
        include: {
          source: true,
          tags: true
        },
        orderBy: { publishedAt: 'desc' }
      });
      
      // ソース別の統計
      const sourceStats = new Map<string, number>();
      articles.forEach(article => {
        const sourceName = article.source.name;
        sourceStats.set(sourceName, (sourceStats.get(sourceName) || 0) + 1);
      });
      
      results.push({
        tagName,
        tagId: tag.id,
        articleCount: tag._count.articles,
        sourceStats,
        articles
      });
    }
    
    // 結果を表示
    console.log('【タグ別の使用状況】');
    console.log('='.repeat(80));
    
    results.forEach(result => {
      console.log(`\n「${result.tagName}」タグ:`);
      console.log(`  ID: ${result.tagId}`);
      console.log(`  記事数: ${result.articleCount}件`);
      console.log(`  ソース別内訳:`);
      result.sourceStats.forEach((count: number, source: string) => {
        const percentage = ((count / result.articleCount) * 100).toFixed(1);
        console.log(`    ${source}: ${count}件 (${percentage}%)`);
      });
    });
    
    // 共起関係の分析
    console.log('\n【タグの共起関係】');
    console.log('='.repeat(80));
    
    if (results.length >= 2) {
      // 3つのタグすべてが付いている記事を確認
      const tag1Articles = new Set(results[0]?.articles.map((a: any) => a.id) || []);
      const tag2Articles = new Set(results[1]?.articles.map((a: any) => a.id) || []);
      const tag3Articles = new Set(results[2]?.articles.map((a: any) => a.id) || []);
      
      // 交差を計算
      const allThree = [...tag1Articles].filter(id => 
        tag2Articles.has(id) && tag3Articles.has(id)
      );
      
      console.log(`\n3つすべてのタグが付いている記事: ${allThree.length}件`);
      
      // ペアワイズの共起
      if (results[0] && results[1]) {
        const pair12 = [...tag1Articles].filter(id => tag2Articles.has(id));
        console.log(`「${results[0].tagName}」と「${results[1].tagName}」の共起: ${pair12.length}件`);
      }
      if (results[0] && results[2]) {
        const pair13 = [...tag1Articles].filter(id => tag3Articles.has(id));
        console.log(`「${results[0].tagName}」と「${results[2].tagName}」の共起: ${pair13.length}件`);
      }
      if (results[1] && results[2]) {
        const pair23 = [...tag2Articles].filter(id => tag3Articles.has(id));
        console.log(`「${results[1].tagName}」と「${results[2].tagName}」の共起: ${pair23.length}件`);
      }
    }
    
    // サンプル記事の表示
    console.log('\n【サンプル記事（最新5件）】');
    console.log('='.repeat(80));
    
    // すべてのタグが付いている記事から最新5件を取得
    const allArticles = results.flatMap(r => r.articles);
    const uniqueArticles = Array.from(
      new Map(allArticles.map((a: any) => [a.id, a])).values()
    );
    
    uniqueArticles.slice(0, 5).forEach((article: any, index: number) => {
      const date = article.publishedAt.toISOString().split('T')[0];
      const tags = article.tags.map((t: any) => t.name).join(', ');
      console.log(`\n${index + 1}. [${date}] ${article.source.name}`);
      console.log(`   タイトル: ${article.title.substring(0, 60)}...`);
      console.log(`   タグ: ${tags}`);
    });
    
    // 判定
    console.log('\n【分析結果】');
    console.log('='.repeat(80));
    
    const allAWS = results.every(r => 
      r.sourceStats.size === 1 && r.sourceStats.has('AWS')
    );
    
    if (allAWS) {
      console.log('✅ すべてのタグ（What\'s New, 新機能, Updates）はAWSソースのみで使用されています。');
      console.log('   → これらはAWSの新機能記事を表す重複したタグです。');
      console.log('   → 削除しても記事の識別には影響しません（AWSタグで識別可能）。');
    } else {
      console.log('⚠️  一部のタグは複数のソースで使用されています。');
      console.log('   → 削除前に詳細な影響分析が必要です。');
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAWSSpecificTags();