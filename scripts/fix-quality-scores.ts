import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixQualityScores() {
  console.log('📊 品質スコアの修正を開始します...\n');

  try {
    // 品質スコアが0の記事を取得
    const articlesWithoutScore = await prisma.article.findMany({
      where: {
        qualityScore: 0
      },
      include: {
        source: true
      }
    });

    console.log(`📄 品質スコア0の記事数: ${articlesWithoutScore.length}件`);

    for (const article of articlesWithoutScore) {
      // シンプルな品質スコア計算
      let score = 50; // 基本スコア

      // ブックマーク数によるスコア
      if (article.bookmarks) {
        if (article.bookmarks >= 100) score += 30;
        else if (article.bookmarks >= 50) score += 25;
        else if (article.bookmarks >= 20) score += 20;
        else if (article.bookmarks >= 10) score += 15;
        else score += 10;
      }

      // 投票数によるスコア
      if (article.userVotes > 0) {
        score += Math.min(article.userVotes * 2, 10);
      }

      // ソースによるボーナス
      const trustedSources = ['はてなブックマーク', 'Qiita Popular', 'AWS'];
      if (trustedSources.includes(article.source.name)) {
        score += 5;
      }

      // 最大100に制限
      const finalScore = Math.min(100, score);

      // 更新
      await prisma.article.update({
        where: { id: article.id },
        data: { qualityScore: finalScore }
      });

      console.log(`✓ ${article.title.slice(0, 50)}... -> スコア: ${finalScore}`);
    }

    console.log('\n✅ 品質スコアの修正が完了しました');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixQualityScores();