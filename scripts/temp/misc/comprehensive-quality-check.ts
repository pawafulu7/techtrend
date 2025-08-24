#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function comprehensiveQualityCheck() {
  console.error('🔍 全記事の一覧要約・詳細要約を包括的にチェック\n');
  
  try {
    // すべての記事を取得
    const allArticles = await prisma.article.findMany({
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        source: { select: { name: true } },
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.error(`全記事数: ${allArticles.length}件\n`);
    
    const problems = {
      // 一覧要約の問題
      summaryMissing: [],
      summaryTooShort: [],
      summaryTooLong: [],
      summaryEnglish: [],
      summaryPrefix: [],
      summaryMarkdown: [],
      summaryUnclear: [],
      summaryIncomplete: [],
      
      // 詳細要約の問題
      detailedMissing: [],
      detailedNoTechnicalBg: [],
      detailedTooFewItems: [],
      detailedEnglish: [],
      detailedMarkdown: [],
      detailedFormat: []
    };
    
    for (const article of allArticles) {
      const articleInfo = {
        id: article.id,
        title: article.title?.substring(0, 50) + '...',
        source: article.source?.name,
        summary: article.summary?.substring(0, 50) + '...',
        detailedSummary: article.detailedSummary?.substring(0, 50) + '...'
      };
      
      // 一覧要約のチェック
      if (!article.summary || article.summary.trim() === '') {
        problems.summaryMissing.push(articleInfo);
      } else {
        const summary = article.summary.trim();
        
        // 長さチェック
        if (summary.length < 20) {
          problems.summaryTooShort.push({
            ...articleInfo,
            length: summary.length,
            summary: summary
          });
        } else if (summary.length > 150) {
          problems.summaryTooLong.push({
            ...articleInfo,
            length: summary.length,
            summary: summary.substring(0, 100) + '...'
          });
        }
        
        // 英語チェック（日本語が30%未満）
        const japaneseChars = (summary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const totalChars = summary.length;
        if (totalChars > 10 && japaneseChars / totalChars < 0.3) {
          problems.summaryEnglish.push({
            ...articleInfo,
            japaneseRatio: Math.round((japaneseChars / totalChars) * 100),
            summary: summary
          });
        }
        
        // プレフィックスチェック
        if (summary.match(/^[\s]*要約[:：]/i) || 
            summary.match(/^[\s]*\*\*要約/i) ||
            summary.match(/^[\s]*##/i) ||
            summary.match(/^[\s]*Summary[:：]/i)) {
          problems.summaryPrefix.push({
            ...articleInfo,
            summary: summary
          });
        }
        
        // Markdown記法チェック
        if (summary.includes('**') || 
            summary.includes('##') ||
            summary.includes('```') ||
            summary.includes('`')) {
          problems.summaryMarkdown.push({
            ...articleInfo,
            summary: summary
          });
        }
        
        // 不明瞭な内容チェック
        if (summary.includes('不明') || 
            summary.includes('記載なし') ||
            summary.includes('情報なし') ||
            summary.includes('undefined') ||
            summary.includes('null') ||
            summary.includes('N/A') ||
            summary === '.' ||
            summary === '...' ||
            summary.includes('提供されたテキスト') ||
            summary.includes('記事内容が提示されていない')) {
          problems.summaryUnclear.push({
            ...articleInfo,
            summary: summary
          });
        }
        
        // 文末が不完全
        if (!summary.endsWith('。') && 
            !summary.endsWith('）') && 
            !summary.endsWith('」') &&
            !summary.endsWith('!') &&
            !summary.endsWith('?') &&
            !summary.endsWith('.')) {
          problems.summaryIncomplete.push({
            ...articleInfo,
            summary: summary
          });
        }
      }
      
      // 詳細要約のチェック
      if (!article.detailedSummary || article.detailedSummary.trim() === '') {
        problems.detailedMissing.push(articleInfo);
      } else {
        const detailedSummary = article.detailedSummary.trim();
        const lines = detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        
        // 技術的背景チェック
        if (lines.length > 0 && !lines[0].includes('記事の主題は')) {
          problems.detailedNoTechnicalBg.push({
            ...articleInfo,
            firstLine: lines[0]?.substring(0, 80) + '...'
          });
        }
        
        // 項目数チェック
        if (lines.length < 6) {
          problems.detailedTooFewItems.push({
            ...articleInfo,
            itemCount: lines.length,
            items: lines.map(l => l.substring(0, 50) + '...')
          });
        }
        
        // 英語チェック（日本語が30%未満）
        const japaneseChars = (detailedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const totalChars = detailedSummary.length;
        if (totalChars > 50 && japaneseChars / totalChars < 0.3) {
          problems.detailedEnglish.push({
            ...articleInfo,
            japaneseRatio: Math.round((japaneseChars / totalChars) * 100),
            firstLine: lines[0]?.substring(0, 80) + '...'
          });
        }
        
        // Markdown記法チェック
        if (detailedSummary.includes('**') || 
            detailedSummary.includes('##') ||
            detailedSummary.includes('```')) {
          problems.detailedMarkdown.push({
            ...articleInfo,
            sample: detailedSummary.substring(0, 100) + '...'
          });
        }
        
        // フォーマットエラー（箇条書きでない行がある）
        const allLines = detailedSummary.split('\n').filter(l => l.trim() !== '');
        const invalidLines = allLines.filter(l => !l.trim().startsWith('・'));
        if (invalidLines.length > 0) {
          problems.detailedFormat.push({
            ...articleInfo,
            invalidLines: invalidLines.slice(0, 3).map(l => l.substring(0, 50) + '...')
          });
        }
      }
    }
    
    // 結果を表示
    console.error('='.repeat(60));
    console.error('📊 問題検出結果\n');
    
    console.error('【一覧要約の問題】');
    console.error(`  ❌ 要約なし: ${problems.summaryMissing.length}件`);
    console.error(`  📏 短すぎる（<20文字）: ${problems.summaryTooShort.length}件`);
    console.error(`  📏 長すぎる（>150文字）: ${problems.summaryTooLong.length}件`);
    console.error(`  🌍 英語要約: ${problems.summaryEnglish.length}件`);
    console.error(`  🏷️ プレフィックスあり: ${problems.summaryPrefix.length}件`);
    console.error(`  📝 Markdown記法: ${problems.summaryMarkdown.length}件`);
    console.error(`  ❓ 不明瞭な内容: ${problems.summaryUnclear.length}件`);
    console.error(`  ✂️ 文末不完全: ${problems.summaryIncomplete.length}件`);
    
    console.error('\n【詳細要約の問題】');
    console.error(`  ❌ 詳細要約なし: ${problems.detailedMissing.length}件`);
    console.error(`  🎯 技術的背景なし: ${problems.detailedNoTechnicalBg.length}件`);
    console.error(`  📉 項目数不足（<6）: ${problems.detailedTooFewItems.length}件`);
    console.error(`  🌍 英語詳細要約: ${problems.detailedEnglish.length}件`);
    console.error(`  📝 Markdown記法: ${problems.detailedMarkdown.length}件`);
    console.error(`  ⚠️ フォーマットエラー: ${problems.detailedFormat.length}件`);
    
    // 全体統計
    const totalProblems = new Set([
      ...problems.summaryMissing.map(a => a.id),
      ...problems.summaryTooShort.map(a => a.id),
      ...problems.summaryTooLong.map(a => a.id),
      ...problems.summaryEnglish.map(a => a.id),
      ...problems.summaryPrefix.map(a => a.id),
      ...problems.summaryMarkdown.map(a => a.id),
      ...problems.summaryUnclear.map(a => a.id),
      ...problems.summaryIncomplete.map(a => a.id),
      ...problems.detailedMissing.map(a => a.id),
      ...problems.detailedNoTechnicalBg.map(a => a.id),
      ...problems.detailedTooFewItems.map(a => a.id),
      ...problems.detailedEnglish.map(a => a.id),
      ...problems.detailedMarkdown.map(a => a.id),
      ...problems.detailedFormat.map(a => a.id)
    ]);
    
    console.error('\n' + '='.repeat(60));
    console.error(`\n🔴 問題のある記事総数: ${totalProblems.size}件 / ${allArticles.length}件`);
    console.error(`✅ 問題なし: ${allArticles.length - totalProblems.size}件`);
    console.error(`📈 品質スコア: ${((allArticles.length - totalProblems.size) / allArticles.length * 100).toFixed(1)}%`);
    
    // 詳細な問題リストを出力（最も重要な問題のみ）
    if (problems.summaryMissing.length > 0) {
      console.error('\n🚨 要約が完全に欠落している記事:');
      problems.summaryMissing.slice(0, 5).forEach(a => {
        console.error(`  - ${a.id}: ${a.title} (${a.source})`);
      });
      if (problems.summaryMissing.length > 5) {
        console.error(`  ... 他${problems.summaryMissing.length - 5}件`);
      }
    }
    
    if (problems.summaryEnglish.length > 0) {
      console.error('\n🌍 英語の一覧要約（日本語化が必要）:');
      problems.summaryEnglish.slice(0, 5).forEach(a => {
        console.error(`  - ${a.id}: 日本語${a.japaneseRatio}% - ${a.summary}`);
      });
      if (problems.summaryEnglish.length > 5) {
        console.error(`  ... 他${problems.summaryEnglish.length - 5}件`);
      }
    }
    
    if (problems.detailedNoTechnicalBg.length > 0) {
      console.error('\n🎯 技術的背景がない詳細要約:');
      problems.detailedNoTechnicalBg.slice(0, 5).forEach(a => {
        console.error(`  - ${a.id}: ${a.firstLine}`);
      });
      if (problems.detailedNoTechnicalBg.length > 5) {
        console.error(`  ... 他${problems.detailedNoTechnicalBg.length - 5}件`);
      }
    }
    
    // 修正が必要な記事IDをファイルに保存
    const problemIds = Array.from(totalProblems);
    const outputData = {
      totalProblems: problemIds.length,
      problemIds: problemIds,
      details: {
        summaryMissing: problems.summaryMissing.map(a => a.id),
        summaryTooShort: problems.summaryTooShort.map(a => a.id),
        summaryTooLong: problems.summaryTooLong.map(a => a.id),
        summaryEnglish: problems.summaryEnglish.map(a => a.id),
        summaryPrefix: problems.summaryPrefix.map(a => a.id),
        summaryMarkdown: problems.summaryMarkdown.map(a => a.id),
        summaryUnclear: problems.summaryUnclear.map(a => a.id),
        summaryIncomplete: problems.summaryIncomplete.map(a => a.id),
        detailedMissing: problems.detailedMissing.map(a => a.id),
        detailedNoTechnicalBg: problems.detailedNoTechnicalBg.map(a => a.id),
        detailedTooFewItems: problems.detailedTooFewItems.map(a => a.id),
        detailedEnglish: problems.detailedEnglish.map(a => a.id),
        detailedMarkdown: problems.detailedMarkdown.map(a => a.id),
        detailedFormat: problems.detailedFormat.map(a => a.id)
      }
    };
    
    const fs = require('fs');
    fs.writeFileSync('problem-articles.json', JSON.stringify(outputData, null, 2));
    console.error('\n📁 問題のある記事IDを problem-articles.json に保存しました');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

comprehensiveQualityCheck().catch(console.error);