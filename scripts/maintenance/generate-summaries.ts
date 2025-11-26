import { PrismaClient } from '@prisma/client';
import { SummaryManager } from '@/lib/services/summary-manager';

const prisma = new PrismaClient();

interface GenerateResult {
  generated: number;
  errors: number;
}

interface GenerateSummariesOptions {
  articleIds?: string[];
}

async function generateSummaries(options: GenerateSummariesOptions = {}): Promise<GenerateResult> {
  console.error('📝 要約とタグの生成を開始します...');

  const summaryManager = new SummaryManager(prisma);

  try {
    const result = await summaryManager.generateSummaries({
      articleIds: options.articleIds,
    });

    console.error('📊 要約とタグ生成完了:');
    console.error(`   - 生成済み: ${result.generated}件`);
    console.error(`   - エラー: ${result.errors}件`);
    console.error(`   - スキップ: ${result.skipped}件`);

    return {
      generated: result.generated,
      errors: result.errors,
    };
  } catch (error) {
    console.error('❌ 要約生成でエラーが発生しました:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

export { generateSummaries };
