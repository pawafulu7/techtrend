import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkWhatsNewTag() {
  console.log('「What\'s New」タグの使用状況を調査中...\n');
  
  try {
    // 1. What's Newタグを取得
    const whatsNewTag = await prisma.tag.findFirst({
      where: {
        name: "What's New"
      },
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });
    
    if (!whatsNewTag) {
      console.log('「What\'s New」タグは見つかりませんでした。');
      return;
    }
    
    console.log(`【What's Newタグ情報】`);
    console.log(`ID: ${whatsNewTag.id}`);
    console.log(`名前: "${whatsNewTag.name}"`);
    console.log(`関連記事数: ${whatsNewTag._count.articles}件\n`);
    
    // 2. What's Newタグが設定されている記事を取得
    const articles = await prisma.article.findMany({
      where: {
        tags: {
          some: {
            id: whatsNewTag.id
          }
        }
      },
      include: {
        source: true,
        tags: true
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    // 3. ソース別の統計
    const sourceStats = new Map<string, number>();
    articles.forEach(article => {
      const sourceName = article.source.name;
      sourceStats.set(sourceName, (sourceStats.get(sourceName) || 0) + 1);
    });
    
    console.log(`【ソース別の記事数】`);
    console.log('='.repeat(50));
    sourceStats.forEach((count, source) => {
      console.log(`${source}: ${count}件`);
    });
    
    // 4. 他のタグとの共起関係
    const coOccurringTags = new Map<string, number>();
    articles.forEach(article => {
      article.tags.forEach(tag => {
        if (tag.name !== "What's New") {
          coOccurringTags.set(tag.name, (coOccurringTags.get(tag.name) || 0) + 1);
        }
      });
    });
    
    console.log(`\n【よく一緒に使われるタグ TOP10】`);
    console.log('='.repeat(50));
    const sortedTags = Array.from(coOccurringTags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sortedTags.forEach(([tag, count]) => {
      const percentage = ((count / articles.length) * 100).toFixed(1);
      console.log(`"${tag}": ${count}件 (${percentage}%)`);
    });
    
    // 5. 最新10件の記事を表示
    console.log(`\n【最新10件の記事】`);
    console.log('='.repeat(80));
    articles.slice(0, 10).forEach((article, index) => {
      const date = article.publishedAt.toISOString().split('T')[0];
      const tags = article.tags.map(t => t.name).join(', ');
      console.log(`\n${index + 1}. [${date}] ${article.source.name}`);
      console.log(`   タイトル: ${article.title.substring(0, 60)}...`);
      console.log(`   タグ: ${tags}`);
    });
    
    // 6. 分析結果
    console.log(`\n【分析結果】`);
    console.log('='.repeat(50));
    console.log(`総記事数: ${articles.length}件`);
    console.log(`最古の記事: ${articles[articles.length - 1]?.publishedAt.toISOString().split('T')[0] || 'N/A'}`);
    console.log(`最新の記事: ${articles[0]?.publishedAt.toISOString().split('T')[0] || 'N/A'}`);
    
    // AWSソースの割合
    const awsCount = sourceStats.get('AWS') || 0;
    const awsPercentage = ((awsCount / articles.length) * 100).toFixed(1);
    console.log(`\nAWSソースの割合: ${awsPercentage}% (${awsCount}/${articles.length}件)`);
    
    // 判定
    console.log(`\n【判定】`);
    console.log('='.repeat(50));
    if (awsPercentage === '100.0') {
      console.log('✅ 「What\'s New」タグはAWSソースのみで使用されています。');
      console.log('   → AWSの新機能記事を識別するために有用です。');
    } else {
      console.log('⚠️  「What\'s New」タグは複数のソースで使用されています。');
      console.log('   → 汎用的なタグとして機能しています。');
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWhatsNewTag();