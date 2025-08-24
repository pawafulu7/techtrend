#!/usr/bin/env npx tsx
/**
 * 各ソースのコンテンツ取得品質をチェック
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SourceStats {
  sourceName: string;
  total: number;
  noContent: number;
  under300: number;
  under500: number;
  under1000: number;
  over1000: number;
  avgLength: number;
  medianLength: number;
  suspiciouslyShort: number; // タイトルから判断して異常に短いと思われる記事
}

async function analyzeContentQuality() {
  console.error('========================================');
  console.error('コンテンツ取得品質分析');
  console.error('========================================\n');

  // 全ソースを取得
  const sources = await prisma.source.findMany({
    orderBy: { name: 'asc' }
  });

  const allStats: SourceStats[] = [];

  for (const source of sources) {
    // 各ソースの記事を分析
    const articles = await prisma.article.findMany({
      where: { sourceId: source.id },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
      }
    });

    if (articles.length === 0) continue;

    // 文字数の配列を作成
    const lengths = articles.map(a => a.content?.length || 0);
    lengths.sort((a, b) => a - b);

    // 統計を計算
    const stats: SourceStats = {
      sourceName: source.name,
      total: articles.length,
      noContent: articles.filter(a => !a.content || a.content.length === 0).length,
      under300: articles.filter(a => a.content && a.content.length > 0 && a.content.length <= 300).length,
      under500: articles.filter(a => a.content && a.content.length > 0 && a.content.length <= 500).length,
      under1000: articles.filter(a => a.content && a.content.length > 0 && a.content.length <= 1000).length,
      over1000: articles.filter(a => a.content && a.content.length > 1000).length,
      avgLength: Math.round(lengths.reduce((sum, len) => sum + len, 0) / lengths.length),
      medianLength: lengths[Math.floor(lengths.length / 2)],
      suspiciouslyShort: 0
    };

    // 疑わしく短い記事を検出（タイトルが技術的で詳細そうなのに300文字以下）
    const suspiciousArticles = articles.filter(a => {
      const contentLen = a.content?.length || 0;
      const titleLen = a.title.length;
      
      // タイトルが長い（30文字以上）または技術的キーワードを含むのに内容が短い
      const technicalKeywords = ['実装', 'チュートリアル', '解説', '構築', '開発', 'API', 'フレームワーク', '比較', '入門'];
      const hasTechnicalKeyword = technicalKeywords.some(kw => a.title.includes(kw));
      
      return contentLen > 0 && contentLen <= 300 && (titleLen > 30 || hasTechnicalKeyword);
    });

    stats.suspiciouslyShort = suspiciousArticles.length;
    allStats.push(stats);

    // 問題のある記事の例を表示
    if (stats.suspiciouslyShort > 0) {
      console.error(`\n【${source.name}】`);
      console.error(`総記事数: ${stats.total}`);
      console.error(`疑わしく短い記事: ${stats.suspiciouslyShort}件`);
      console.error('\n例:');
      suspiciousArticles.slice(0, 3).forEach(article => {
        console.error(`  - "${article.title.substring(0, 50)}..." (${article.content?.length}文字)`);
        console.error(`    URL: ${article.url}`);
      });
    }
  }

  // サマリーテーブル
  console.error('\n========================================');
  console.error('ソース別コンテンツ品質サマリー');
  console.error('========================================\n');
  
  console.error('ソース名\t\t総数\t空\t≤300\t≤500\t≤1000\t>1000\t平均\t中央値\t疑問');
  console.error('----------------------------------------------------------------------------------------');
  
  allStats.forEach(stats => {
    const name = stats.sourceName.padEnd(20);
    const noContentPct = stats.total > 0 ? `${Math.round(stats.noContent / stats.total * 100)}%` : '0%';
    const under300Pct = stats.total > 0 ? `${Math.round(stats.under300 / stats.total * 100)}%` : '0%';
    const suspiciousPct = stats.total > 0 ? `${Math.round(stats.suspiciouslyShort / stats.total * 100)}%` : '0%';
    
    console.error(
      `${name}\t${stats.total}\t${stats.noContent}\t${stats.under300}\t${stats.under500}\t${stats.under1000}\t${stats.over1000}\t${stats.avgLength}\t${stats.medianLength}\t${stats.suspiciouslyShort}`
    );
    
    // 問題がある場合は警告
    if (stats.noContent > stats.total * 0.1) {
      console.error(`  ⚠️ ${noContentPct}の記事にコンテンツがありません`);
    }
    if (stats.under300 > stats.total * 0.2) {
      console.error(`  ⚠️ ${under300Pct}の記事が300文字以下です`);
    }
    if (stats.suspiciouslyShort > stats.total * 0.1) {
      console.error(`  ⚠️ ${suspiciousPct}の記事が疑わしく短いです`);
    }
  });

  // 問題のあるソースのリスト
  console.error('\n========================================');
  console.error('要対応ソース（コンテンツ取得に問題あり）');
  console.error('========================================\n');
  
  const problematicSources = allStats.filter(stats => 
    stats.noContent > stats.total * 0.1 ||
    stats.under300 > stats.total * 0.2 ||
    stats.suspiciouslyShort > stats.total * 0.1
  );
  
  if (problematicSources.length > 0) {
    console.error('以下のソースはコンテンツ取得ロジックの見直しが必要です：\n');
    problematicSources.forEach(stats => {
      console.error(`❌ ${stats.sourceName}`);
      console.error(`   - 平均文字数: ${stats.avgLength}文字`);
      console.error(`   - 300文字以下: ${stats.under300}/${stats.total}記事`);
      console.error(`   - 疑わしく短い: ${stats.suspiciouslyShort}記事`);
      console.error('');
    });
  } else {
    console.error('✅ すべてのソースで正常にコンテンツが取得できています');
  }

  // 推奨事項
  console.error('\n========================================');
  console.error('推奨事項');
  console.error('========================================\n');
  
  console.error('1. 問題のあるソースのEnricherを確認・修正');
  console.error('2. コンテンツが正しく取得できていない記事の再取得');
  console.error('3. 再取得後に要約の再生成');
  console.error('\n具体的な手順:');
  console.error('   1) lib/enrichers/配下の該当Enricherクラスを修正');
  console.error('   2) scripts/maintenance/re-enrich-content.ts を実行');
  console.error('   3) scripts/migration/migrate-to-v7.ts を実行');

  await prisma.$disconnect();
}

// 実行
analyzeContentQuality();