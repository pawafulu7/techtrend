import { PrismaClient } from '@prisma/client';
import { SummaryPostProcessor } from '@/lib/ai/service/post-processor';

const prisma = new PrismaClient();
const processor = new SummaryPostProcessor();

async function backfillCleanup() {
  try {
    console.log('=== DetailedSummary Cleanup Backfill ===\n');
    
    // 1. 対象記事を取得（全バージョン対象、regexでフィルタ）
    const articles = await prisma.$queryRaw<Array<{ id: string; detailedSummary: string; summaryVersion: number }>>`
      SELECT id, "detailedSummary", "summaryVersion"
      FROM "Article"
      WHERE "detailedSummary" ~ '(^|\\n)(?:・|[-*•]|\\d+[\\).．、])[^\\n]*[:：]\\s*\\n(?!\\s*(?:・|[-*•]|\\d+[\\).．、]))'
    `;
    
    console.log(`対象記事: ${articles.length}件\n`);
    
    if (articles.length === 0) {
      console.log('処理対象の記事がありません。');
      return;
    }
    
    // 2. 各記事を処理
    let processed = 0;
    for (const article of articles) {
      const before = article.detailedSummary;
      const after = processor.cleanupDetailedSummary(article.detailedSummary);
      
      // 変更がある場合のみ更新
      if (before !== after) {
        await prisma.article.update({
          where: { id: article.id },
          data: { detailedSummary: after }
        });
        
        processed++;
        console.log(`${processed}/${articles.length} 処理: ${article.id} (v${article.summaryVersion})`);
      } else {
        console.log(`スキップ: ${article.id} (v${article.summaryVersion}, 変更なし)`);
      }
    }
    
    console.log(`\n完了: ${processed}件を更新しました`);
    
    // 3. 検証（全バージョン対象）
    const remaining = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Article"
      WHERE "detailedSummary" ~ '(^|\\n)(?:・|[-*•]|\\d+[\\).．、])[^\\n]*[:：]\\s*\\n(?!\\s*(?:・|[-*•]|\\d+[\\).．、]))'
    `;
    
    const remainingCount = Number(remaining[0].count);
    console.log(`\n検証: 残り改行パターン = ${remainingCount}件 (期待値: 0)`);
    
    if (remainingCount === 0) {
      console.log('✓ バックフィル成功！');
    } else {
      console.log('⚠ まだ改行パターンが残っています');
    }
    
  } catch (error) {
    console.error('エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  backfillCleanup()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { backfillCleanup };
