#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function finalStats() {
  console.error('📊 最終品質統計レポート\n');
  
  try {
    const articles = await prisma.article.findMany({
      where: { summary: { not: null } },
      select: { 
        summary: true,
        source: { select: { name: true } }
      },
      orderBy: { publishedAt: 'desc' },
      take: 1500
    });
    
    let totalProblems = 0;
    const problemTypes = {
      englishOnly: 0,
      tooShort: 0,
      incomplete: 0,
      metadata: 0,
      tooLong: 0,
      perfect: 0
    };
    
    const sourceStats: {[key: string]: {total: number, problems: number}} = {};
    
    for (const article of articles) {
      const summary = article.summary || '';
      const sourceName = article.source.name;
      
      if (!sourceStats[sourceName]) {
        sourceStats[sourceName] = { total: 0, problems: 0 };
      }
      sourceStats[sourceName].total++;
      
      let hasProblem = false;
      
      // 英語のまま
      if (summary.length > 20) {
        const japaneseChars = (summary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        if (japaneseChars / summary.length < 0.4) {
          problemTypes.englishOnly++;
          hasProblem = true;
        }
      }
      
      // 短すぎ
      if (summary.length > 0 && summary.length < 40) {
        problemTypes.tooShort++;
        hasProblem = true;
      }
      
      // 長すぎ
      if (summary.length > 150) {
        problemTypes.tooLong++;
        hasProblem = true;
      }
      
      // 不完全
      const endsProperlyPattern = /[。！？）」]$/;
      if (summary.length > 30 && !summary.match(endsProperlyPattern)) {
        problemTypes.incomplete++;
        hasProblem = true;
      }
      
      // メタデータ
      if (summary.includes('要約:') || summary.includes('Provide') || summary.includes('tags:')) {
        problemTypes.metadata++;
        hasProblem = true;
      }
      
      if (hasProblem) {
        totalProblems++;
        sourceStats[sourceName].problems++;
      } else {
        problemTypes.perfect++;
      }
    }
    
    // 結果表示
    console.error('='.repeat(60));
    console.error('📈 全体統計:');
    console.error(`・総記事数: ${articles.length}件`);
    console.error(`・問題なし: ${problemTypes.perfect}件`);
    console.error(`・問題あり: ${totalProblems}件`);
    console.error(`・品質スコア: ${((problemTypes.perfect / articles.length) * 100).toFixed(1)}%`);
    
    console.error('\n⚠️ 問題の内訳:');
    console.error(`・英語のまま: ${problemTypes.englishOnly}件`);
    console.error(`・短すぎ(<40文字): ${problemTypes.tooShort}件`);
    console.error(`・長すぎ(>150文字): ${problemTypes.tooLong}件`);
    console.error(`・文が不完全: ${problemTypes.incomplete}件`);
    console.error(`・メタデータ混入: ${problemTypes.metadata}件`);
    
    console.error('\n📊 ソース別品質:');
    const sortedSources = Object.entries(sourceStats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);
    
    for (const [source, stats] of sortedSources) {
      const qualityRate = ((stats.total - stats.problems) / stats.total * 100).toFixed(1);
      console.error(`・${source}: ${qualityRate}% (${stats.total - stats.problems}/${stats.total}件が正常)`);
    }
    
    console.error('\n✨ 改善サマリー:');
    console.error('・初回: 品質スコア 35.6%');
    console.error('・第1次修正後: 品質スコア 40.0%');
    console.error('・第2次修正後: 品質スコア 94.4%');
    console.error(`・現在: 品質スコア ${((problemTypes.perfect / articles.length) * 100).toFixed(1)}%`);
    
    if (problemTypes.englishOnly > 10) {
      console.error('\n💡 追加の推奨対応:');
      console.error('・英語記事の自動翻訳システムの導入');
      console.error('・AWS記事専用の翻訳スクリプト作成');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

finalStats().catch(console.error);