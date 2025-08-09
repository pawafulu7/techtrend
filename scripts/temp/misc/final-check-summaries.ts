#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function finalCheckSummaries() {
  console.log('🔍 最終的な要約品質チェック\n');
  
  try {
    // 全記事を取得（最新3000件）
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { summary: { not: null } },
          { detailedSummary: { not: null } }
        ]
      },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        source: { select: { name: true } },
        publishedAt: true,
        url: true
      },
      orderBy: { publishedAt: 'desc' },
      take: 3000
    });
    
    console.log(`📊 チェック対象: ${articles.length}件\n`);
    
    // 新しい問題パターンも含めて詳細にチェック
    const detailedProblems: {[key: string]: any[]} = {
      // 既存のパターン
      htmlEntities: [],
      englishThinking: [],
      quoteAsSum: [],
      incomplete: [],
      duplicatePunct: [],
      strangeFormat: [],
      genFailure: [],
      metadata: [],
      veryShort: [],
      titleDupe: [],
      detailInsufficient: [],
      englishOnly: [],
      
      // 新しいパターン
      jsonLeak: [],           // JSON形式の混入
      codeFragment: [],       // コード断片の混入
      urlInSummary: [],       // URLが含まれる
      numberOnly: [],         // 数字のみ
      specialChars: [],       // 特殊文字の異常
      emptyDetail: [],        // 詳細要約が空
      brokenEncoding: [],     // 文字化け
      repetitive: [],         // 同じ語句の繰り返し
      tooGeneric: [],         // あまりに一般的
      debugOutput: []         // デバッグ出力の混入
    };
    
    for (const article of articles) {
      const summary = article.summary || '';
      const detailedSummary = article.detailedSummary || '';
      
      // HTMLエンティティ
      if (summary.match(/&[a-z]+;/i)) {
        detailedProblems.htmlEntities.push(article);
      }
      
      // 英語の思考過程（より広範なパターン）
      if (summary.match(/\b(We need|Use article|Provide|Let me|I think|Therefore|However)\b/i)) {
        detailedProblems.englishThinking.push(article);
      }
      
      // 引用がそのまま
      if (summary.includes('記事内容が「') || summary.includes('内容は「')) {
        detailedProblems.quoteAsSum.push(article);
      }
      
      // 不完全な文
      if (summary.length > 30 && !summary.match(/[。！？）」]$/)) {
        detailedProblems.incomplete.push(article);
      }
      
      // 重複句読点
      if (summary.match(/[。、]{2,}/)) {
        detailedProblems.duplicatePunct.push(article);
      }
      
      // 不自然なフォーマット
      if (summary.match(/\s{3,}|\n{2,}|^\s+|\s+$/)) {
        detailedProblems.strangeFormat.push(article);
      }
      
      // 生成失敗
      if (summary.match(/仮に|仮定|想定される|生成できません/)) {
        detailedProblems.genFailure.push(article);
      }
      
      // メタデータ混入（拡張パターン）
      if (summary.match(/要約[:：]|分析[:：]|詳細要約[:：]|tags?[:：]/i)) {
        detailedProblems.metadata.push(article);
      }
      
      // 極端に短い（改善版：実質的な内容チェック）
      const effectiveLength = summary.replace(/[。、！？\s]/g, '').length;
      if (effectiveLength > 0 && effectiveLength < 15) {
        detailedProblems.veryShort.push(article);
      }
      
      // タイトル重複（類似度チェック）
      const titleWords = article.title.substring(0, 30);
      const summaryWords = summary.substring(0, 30);
      if (titleWords === summaryWords && summary.length < article.title.length + 10) {
        detailedProblems.titleDupe.push(article);
      }
      
      // 詳細要約不足
      if (detailedSummary) {
        const items = detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (items.length > 0 && items.length < 4) {
          detailedProblems.detailInsufficient.push(article);
        }
      }
      
      // 英語のまま（厳密版）
      if (summary.length > 20) {
        const japaneseChars = (summary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const ratio = japaneseChars / summary.length;
        if (ratio < 0.4) {
          detailedProblems.englishOnly.push(article);
        }
      }
      
      // === 新しいパターン ===
      
      // JSON形式の混入
      if (summary.match(/^\{|\}$|"[^"]+"\s*:/)) {
        detailedProblems.jsonLeak.push(article);
      }
      
      // コード断片
      if (summary.match(/\(\)|\[\]|=>|function|const |let |var /)) {
        detailedProblems.codeFragment.push(article);
      }
      
      // URL混入
      if (summary.match(/https?:\/\/|www\./)) {
        detailedProblems.urlInSummary.push(article);
      }
      
      // 数字のみ
      if (summary.match(/^\d+$|^[\d\s,\.]+$/)) {
        detailedProblems.numberOnly.push(article);
      }
      
      // 特殊文字の異常
      if (summary.match(/[\x00-\x1F\x7F]|�/)) {
        detailedProblems.specialChars.push(article);
      }
      
      // 詳細要約が空
      if (!detailedSummary || detailedSummary.trim() === '') {
        detailedProblems.emptyDetail.push(article);
      }
      
      // 文字化け
      if (summary.match(/[???]{3,}|\\u[0-9a-f]{4}/i)) {
        detailedProblems.brokenEncoding.push(article);
      }
      
      // 繰り返し（同じ単語が3回以上）
      const words = summary.split(/[、。\s]+/);
      const wordCounts: {[key: string]: number} = {};
      for (const word of words) {
        if (word.length > 2) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      }
      if (Object.values(wordCounts).some(count => count >= 3)) {
        detailedProblems.repetitive.push(article);
      }
      
      // あまりに一般的
      if (summary.match(/^(この記事|本記事|記事|内容|説明|解説|紹介)$/)) {
        detailedProblems.tooGeneric.push(article);
      }
      
      // デバッグ出力
      if (summary.match(/console\.|print\(|debug|TODO|FIXME/i)) {
        detailedProblems.debugOutput.push(article);
      }
    }
    
    // 問題の集計と表示
    console.log('📈 検出された問題パターン:');
    console.log('─'.repeat(80));
    
    const problemSummary: {[key: string]: number} = {};
    let totalProblems = 0;
    const uniqueProblematicIds = new Set<string>();
    
    for (const [problemType, articles] of Object.entries(detailedProblems)) {
      if (articles.length > 0) {
        problemSummary[problemType] = articles.length;
        totalProblems += articles.length;
        articles.forEach((a: any) => uniqueProblematicIds.add(a.id));
        
        // 問題の詳細を表示（上位のみ）
        if (articles.length >= 3) {
          const displayName = problemType
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase());
          
          console.log(`\n【${displayName}】: ${articles.length}件`);
          
          // 最初の2件を例として表示
          for (let i = 0; i < Math.min(2, articles.length); i++) {
            const article = articles[i] as any;
            console.log(`  ${i + 1}. ${article.title.substring(0, 40)}...`);
            console.log(`     ID: ${article.id}`);
            console.log(`     ソース: ${article.source.name}`);
            if (problemType !== 'emptyDetail') {
              console.log(`     要約: "${article.summary?.substring(0, 60)}..."`);
            }
          }
        }
      }
    }
    
    // 最終サマリー
    console.log('\n' + '='.repeat(80));
    console.log('📊 最終品質レポート:');
    console.log(`・総記事数: ${articles.length}件`);
    console.log(`・問題のある記事（ユニーク）: ${uniqueProblematicIds.size}件`);
    console.log(`・品質スコア: ${((1 - uniqueProblematicIds.size / articles.length) * 100).toFixed(1)}%`);
    
    // 問題の深刻度別分類
    const critical = ['englishThinking', 'jsonLeak', 'codeFragment', 'brokenEncoding', 'englishOnly'];
    const moderate = ['metadata', 'incomplete', 'htmlEntities', 'quoteAsSum'];
    const minor = ['veryShort', 'duplicatePunct', 'strangeFormat'];
    
    const criticalCount = critical.reduce((sum, key) => sum + (problemSummary[key] || 0), 0);
    const moderateCount = moderate.reduce((sum, key) => sum + (problemSummary[key] || 0), 0);
    const minorCount = minor.reduce((sum, key) => sum + (problemSummary[key] || 0), 0);
    
    console.log('\n⚠️ 問題の深刻度:');
    console.log(`・重大: ${criticalCount}件`);
    console.log(`・中程度: ${moderateCount}件`);
    console.log(`・軽微: ${minorCount}件`);
    
    // トップ問題
    const sortedProblems = Object.entries(problemSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    if (sortedProblems.length > 0) {
      console.log('\n🔝 最も多い問題（トップ5）:');
      for (let i = 0; i < sortedProblems.length; i++) {
        const [type, count] = sortedProblems[i];
        const displayName = type
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase());
        console.log(`${i + 1}. ${displayName}: ${count}件`);
      }
    }
    
    // 推奨アクション
    if (uniqueProblematicIds.size > 0) {
      console.log('\n💡 推奨アクション:');
      
      if (criticalCount > 0) {
        console.log('1. 重大な問題の即時修正: npx tsx scripts/fix-critical-issues.ts');
      }
      if (moderateCount > 0) {
        console.log('2. 中程度の問題の修正: npx tsx scripts/fix-moderate-issues.ts');
      }
      if (detailedProblems.emptyDetail.length > 0) {
        console.log('3. 詳細要約の生成: npx tsx scripts/generate-missing-details.ts');
      }
      
      console.log('\n✨ 品質向上のヒント:');
      console.log('- 定期的な品質チェックの実施');
      console.log('- AIサービスのプロンプト最適化');
      console.log('- エラーハンドリングの強化');
    } else {
      console.log('\n✨ 素晴らしい！すべての記事が高品質です。');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

finalCheckSummaries().catch(console.error);