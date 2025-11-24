/**
 * 修正後の要約を検証するスクリプト
 *
 * summary, detailedSummary の2フィールドをスキャンし、
 * プロンプト指示文の混入がないことを確認する。
 *
 * Note: headline フィールドは Article テーブルに存在しないため対象外
 *
 * Usage:
 *   npx tsx scripts/verify-fixed-summaries.ts
 */

import { PrismaClient } from '@prisma/client';
import { CONTAMINATION_SEARCH_TERMS } from '../lib/ai/constants';

async function main(): Promise<number> {
  const prisma = new PrismaClient();

  try {
    console.log('[Verify] Checking for prompt contamination across 2 fields...');
    console.log(`[Verify] Search terms: ${CONTAMINATION_SEARCH_TERMS.length}`);

    // 2フィールドをスキャン（OR条件）
    const contaminatedSummary = await prisma.article.findMany({
      where: {
        OR: CONTAMINATION_SEARCH_TERMS.flatMap(term => [
          { summary: { contains: term } },
          { detailedSummary: { contains: term } },
        ]),
      },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
      },
    });

    // 結果を集計
    const results = {
      summary: [] as typeof contaminatedSummary,
      detailedSummary: [] as typeof contaminatedSummary,
    };

    for (const article of contaminatedSummary) {
      const summaryContaminated = CONTAMINATION_SEARCH_TERMS.some(term =>
        article.summary?.includes(term)
      );
      const detailedContaminated = CONTAMINATION_SEARCH_TERMS.some(term =>
        article.detailedSummary?.includes(term)
      );

      if (summaryContaminated) {
        results.summary.push(article);
      }
      if (detailedContaminated) {
        results.detailedSummary.push(article);
      }
    }

    // 重複除去
    const uniqueIds = new Set<string>();
    const uniqueArticles = contaminatedSummary.filter(article => {
      if (uniqueIds.has(article.id)) {
        return false;
      }
      uniqueIds.add(article.id);
      return true;
    });

    // 結果出力
    if (uniqueArticles.length === 0) {
      console.log('[Verify] ✓ No contamination found!');
      console.log('[Verify] All fields are clean.');
      return 0;
    } else {
      console.log(`[Verify] ✗ Found ${uniqueArticles.length} contaminated articles:`);
      console.log(`[Verify]   - summary field: ${results.summary.length}`);
      console.log(`[Verify]   - detailedSummary field: ${results.detailedSummary.length}`);
      console.log('');

      for (const article of uniqueArticles.slice(0, 10)) {
        const fields: string[] = [];
        if (results.summary.some(a => a.id === article.id)) {
          fields.push('summary');
        }
        if (results.detailedSummary.some(a => a.id === article.id)) {
          fields.push('detailedSummary');
        }

        console.log(`  - ${article.id} [${fields.join(', ')}]:`);
        console.log(`    Title: ${article.title}`);
        if (fields.includes('summary')) {
          console.log(`    Summary: ${article.summary?.substring(0, 100)}...`);
        }
      }

      if (uniqueArticles.length > 10) {
        console.log(`  ... and ${uniqueArticles.length - 10} more`);
      }

      return 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error('[Verify] Error:', error);
    process.exit(1);
  });
