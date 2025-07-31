import { PrismaClient } from '@prisma/client';
import { ArticleSummarizer } from '../lib/ai/summarizer';

const prisma = new PrismaClient();
const summarizer = new ArticleSummarizer(process.env.GEMINI_API_KEY!);

async function generateDetailedSummaries() {
  console.log('📝 既存記事の詳細要約を生成します...');
  const startTime = Date.now();

  try {
    // 詳細要約がない記事を取得
    const articlesWithoutDetailedSummary = await prisma.article.findMany({
      where: {
        detailedSummary: null,
        summary: { not: null } // 短い要約はあるが詳細要約がない記事
      },
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: 100
    });

    if (articlesWithoutDetailedSummary.length === 0) {
      console.log('✅ すべての記事に詳細要約があります');
      return;
    }

    console.log(`📄 処理対象: ${articlesWithoutDetailedSummary.length}件`);

    let processedCount = 0;
    let errorCount = 0;

    for (const article of articlesWithoutDetailedSummary) {
      try {
        console.log(`\n処理中: [${article.source.name}] ${article.title.substring(0, 40)}...`);
        
        const content = article.content || article.summary || '';
        
        // Gemini APIで詳細要約を生成
        const prompt = `以下の技術記事を分析し、300-500文字程度の詳細な要約を作成してください。

タイトル: ${article.title}
内容: ${content.substring(0, 4000)}

【要約の要件】
- 記事が扱っている主題と背景を明確に説明
- 解決しようとしている具体的な問題や課題を記述
- 提案されている解決策やアプローチの詳細を説明
- 実装方法や重要なポイントを含める
- 得られる効果やメリットを明記
- 注意点や制限事項があれば言及
- 本文をそのまま抜粋するのではなく、要点を整理して要約すること
- 読者が記事の価値と内容を正確に理解できるように構成すること

詳細要約:`;

        const detailedSummary = await summarizer.summarize(
          article.id,
          article.title,
          prompt
        );

        if (detailedSummary) {
          await prisma.article.update({
            where: { id: article.id },
            data: { detailedSummary }
          });
          console.log(`✓ 詳細要約を生成しました`);
          processedCount++;
        } else {
          console.log(`× 詳細要約の生成に失敗しました`);
          errorCount++;
        }

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        console.error(`× エラー: ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n📊 完了: 成功${processedCount}件, エラー${errorCount}件 (${duration}秒)`);

  } catch (error) {
    console.error('❌ エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  generateDetailedSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { generateDetailedSummaries };