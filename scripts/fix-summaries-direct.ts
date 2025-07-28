import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixSummariesDirectly() {
  console.log('📝 要約の直接修正を開始します...');

  try {
    // 問題のある要約を持つ記事を取得
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { summary: { startsWith: '本記事' } },
          { summary: { startsWith: '本稿' } },
          { summary: { startsWith: '、' } },
          { summary: { startsWith: '。' } },
        ]
      },
    });

    console.log(`📄 修正対象の記事数: ${articles.length}件`);

    let fixedCount = 0;

    for (const article of articles) {
      let summary = article.summary || '';
      
      // 枕詞の削除（「本記事では」パターンも含む）
      summary = summary
        .replace(/^(本記事では|本記事は|本稿では|記事では|この記事は|本文では|この文書は)、?/g, '')
        .replace(/^本記事「[^」]+」は、?/g, '') // 「本記事「タイトル」は」パターンも削除
        .trim();
      
      // 文頭の句読点を削除
      summary = summary.replace(/^[、。,\.]\s*/, '');
      
      // 文末に句点がない場合は追加
      if (summary && !summary.match(/[。.!?]$/)) {
        summary += '。';
      }
      
      // 更新
      await prisma.article.update({
        where: { id: article.id },
        data: { summary },
      });
      
      fixedCount++;
      console.log(`✓ 修正: ${article.title.substring(0, 50)}...`);
      console.log(`  変更前: ${article.summary?.substring(0, 50)}...`);
      console.log(`  変更後: ${summary.substring(0, 50)}...`);
    }

    console.log(`\n✅ 要約の修正が完了しました: ${fixedCount}件`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixSummariesDirectly().catch(console.error);