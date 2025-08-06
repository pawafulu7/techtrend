import { PrismaClient } from '@prisma/client';
import { generateSummaries } from './generate-summaries';

const prisma = new PrismaClient();

async function regenerateSpeakerDeckSummaries() {
  try {
    // Speaker Deckソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'Speaker Deck' }
    });
    
    if (!source) {
      console.log('Speaker Deckソースが見つかりません');
      return;
    }
    
    // contentが更新されたSpeaker Deck記事を確認
    const articlesWithContent = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        content: { not: null },
        summary: null
      }
    });
    
    const articlesWithGoodContent = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        content: { not: null }
      }
    });
    
    // 十分なcontentを持つ記事をフィルタリング
    const targetArticles = articlesWithGoodContent.filter(article => {
      return article.content && 
             article.content.length > 100 && 
             article.content !== article.title &&
             !article.summary; // 要約がない記事のみ
    });
    
    console.log('\n=== Speaker Deck要約生成対象 ===');
    console.log(`要約なしでcontent有り: ${articlesWithContent.length}件`);
    console.log(`十分なcontent & 要約なし: ${targetArticles.length}件`);
    
    if (targetArticles.length === 0) {
      console.log('\n要約生成対象の記事がありません');
      return;
    }
    
    console.log('\n要約生成を開始します...');
    console.log('対象記事:');
    targetArticles.forEach((article, index) => {
      console.log(`${index + 1}. ${article.title.substring(0, 50)}... (${article.content?.length}文字)`);
    });
    
    // 要約生成を実行
    console.log('\n=== 要約生成実行 ===');
    const result = await generateSummaries();
    
    // 生成後の統計
    const updatedArticles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        summary: { not: null }
      }
    });
    
    const updatedWithDetailedSummary = await prisma.article.count({
      where: {
        sourceId: source.id,
        detailedSummary: { not: null }
      }
    });
    
    const totalArticles = await prisma.article.count({
      where: { sourceId: source.id }
    });
    
    console.log('\n=== 最終統計 ===');
    console.log(`総記事数: ${totalArticles}`);
    console.log(`要約あり: ${updatedArticles.length} (${(updatedArticles.length/totalArticles*100).toFixed(1)}%)`);
    console.log(`詳細要約あり: ${updatedWithDetailedSummary} (${(updatedWithDetailedSummary/totalArticles*100).toFixed(1)}%)`);
    console.log(`要約なし: ${totalArticles - updatedArticles.length} (${((totalArticles - updatedArticles.length)/totalArticles*100).toFixed(1)}%)`);
    
  } catch (error) {
    console.error('エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  regenerateSpeakerDeckSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { regenerateSpeakerDeckSummaries };