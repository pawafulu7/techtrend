import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { determineDifficulty } from '@/lib/utils/quality-score';
import { getLastProcessedTime, saveProcessingStatus } from '../utils/processing-status';

async function calculateDifficultyLevels() {
  console.error('📊 記事の難易度レベルを計算します...\n');

  try {
    // 差分処理: 前回処理以降に更新された記事のみを対象
    const processName = 'difficulty-calculation';
    const checkpoint = new Date();
    const lastProcessedAt = await getLastProcessedTime(processName);

    // 処理対象の記事を取得（差分処理）
    const articles = await prisma.article.findMany({
      where: lastProcessedAt ? {
        OR: [
          { difficulty: null },
          { updatedAt: { gt: lastProcessedAt, lte: checkpoint } }
        ]
      } : { updatedAt: { lte: checkpoint } },
      orderBy: { updatedAt: 'asc' },
      include: {
        source: true,
        tags: true,
      },
    });

    console.error(`📄 処理対象の記事数: ${articles.length}件`);

    let processedCount = 0;
    const difficultyCount = {
      beginner: 0,
      intermediate: 0,
      advanced: 0,
    };
    
    const batchSize = 100;
    
    // バッチ処理で更新
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      
      // (id, difficulty) タプルを収集
      const tuples: { id: string; difficulty: string }[] = [];
      for (const article of batch) {
        const difficulty = determineDifficulty(article);
        difficultyCount[difficulty]++;
        tuples.push({ id: article.id, difficulty });
        processedCount++;
      }

      // bulk UPDATE（VALUES が 1000 件を超える場合はチャンク分割）
      const chunkSize = 1000;
      await prisma.$transaction(async (tx) => {
        for (let j = 0; j < tuples.length; j += chunkSize) {
          const chunk = tuples.slice(j, j + chunkSize);
          if (chunk.length === 0) continue;
          const values = chunk.map(t => Prisma.sql`(${t.id}, ${t.difficulty})`);
          await tx.$executeRaw`
            UPDATE "Article"
            SET "difficulty" = v.difficulty::text
            FROM (VALUES ${Prisma.join(values)}) AS v(id, difficulty)
            WHERE "Article".id = v.id::text
          `;
        }
      });

      console.error(`✓ 処理済み: ${processedCount}/${articles.length}件`);
    }

    console.error('\n【難易度レベル分布】');
    console.error(`初級 (beginner): ${difficultyCount.beginner}件 (${((difficultyCount.beginner / articles.length) * 100).toFixed(1)}%)`);
    console.error(`中級 (intermediate): ${difficultyCount.intermediate}件 (${((difficultyCount.intermediate / articles.length) * 100).toFixed(1)}%)`);
    console.error(`上級 (advanced): ${difficultyCount.advanced}件 (${((difficultyCount.advanced / articles.length) * 100).toFixed(1)}%)`);

    // ソース別の難易度分布
    const sourceStats = await prisma.$queryRaw`
      SELECT 
        s.name as source_name,
        a."difficulty",
        COUNT(*) as count
      FROM "Article" a
      JOIN "Source" s ON a."sourceId" = s.id
      WHERE a."difficulty" IS NOT NULL
      GROUP BY s.name, a."difficulty"
      ORDER BY s.name, a."difficulty"
    ` as { source_name: string; difficulty: string; count: bigint }[];

    console.error('\n【ソース別難易度分布】');
    let currentSource = '';
    sourceStats.forEach(stat => {
      if (currentSource !== stat.source_name) {
        if (currentSource) console.error('');
        console.error(`${stat.source_name}:`);
        currentSource = stat.source_name;
      }
      console.error(`  ${stat.difficulty}: ${Number(stat.count)}件`);
    });

    console.error('\n✅ 難易度レベルの計算が完了しました');

    // 処理状態を記録（差分処理用）
    await saveProcessingStatus(
      processName,
      processedCount,
      'success',
      {
        processedCount,
        difficultyCount,
        checkpoint
      },
      checkpoint
    );

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

calculateDifficultyLevels().catch(console.error);
