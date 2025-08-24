#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../../lib/ai/gemini';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function optimizeLongSummaries() {
  console.error('📏 長すぎる要約を最適化します\n');
  console.error('=' .repeat(60));
  
  try {
    // 問題のある記事IDを読み込み
    const problemData = JSON.parse(fs.readFileSync('problem-articles.json', 'utf-8'));
    
    // 長すぎる要約の記事IDを取得
    const longSummaryIds = problemData.details.summaryTooLong;
    
    console.error(`対象記事数: ${longSummaryIds.length}件`);
    console.error('目標: 100〜120文字の適切な要約に最適化\n');
    
    // Gemini API キーの確認
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('❌ GEMINI_API_KEY が設定されていません');
      process.exit(1);
    }
    
    const geminiClient = new GeminiClient(geminiApiKey);
    
    // 処理結果の記録
    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];
    
    for (let i = 0; i < longSummaryIds.length; i++) {
      const articleId = longSummaryIds[i];
      console.error(`\n[${i + 1}/${longSummaryIds.length}] 処理中: ${articleId}`);
      console.error('-'.repeat(40));
      
      try {
        // 記事を取得
        const article = await prisma.article.findUnique({
          where: { id: articleId },
          include: { source: true }
        });
        
        if (!article) {
          console.error(`  ⚠️ 記事が見つかりません`);
          errorCount++;
          continue;
        }
        
        console.error(`  📄 タイトル: ${article.title?.substring(0, 50)}...`);
        console.error(`  🏷️ ソース: ${article.source?.name}`);
        console.error(`  📝 現在の要約: ${article.summary?.substring(0, 80)}...`);
        console.error(`  📏 現在の文字数: ${article.summary?.length || 0}文字`);
        
        // 最適化された要約を生成
        console.error(`  🔄 要約を最適化中...`);
        
        // カスタムプロンプトで短縮を指示
        const optimizationPrompt = `
以下の要約を100〜120文字に調整してください。
技術的な要点と主要な成果を残し、冗長な表現を削除してください。
具体的な技術名や数値は可能な限り残してください。

元の要約: ${article.summary}

調整版（100〜120文字）:`;
        
        const model = geminiClient.model;
        const result = await model.generateContent(optimizationPrompt);
        const response = result.response;
        let optimizedSummary = response.text().trim();
        
        // 不要なプレフィックスを削除
        optimizedSummary = optimizedSummary
          .replace(/^短縮版[:：]\s*/i, '')
          .replace(/^要約[:：]\s*/i, '')
          .replace(/^\*\*/g, '')
          .replace(/\*\*$/g, '')
          .trim();
        
        // 品質チェック
        const qualityCheck = validateOptimizedSummary(optimizedSummary);
        
        if (!qualityCheck.isValid) {
          console.error(`  ⚠️ 最適化された要約が基準を満たしていません: ${qualityCheck.reason}`);
          
          // 再試行：別のアプローチ
          const retryPrompt = `
技術記事「${article.title}」の要約を100〜120文字で作成してください。
重要な技術キーワードと主な内容を含めてください。`;
          
          const retryResult = await model.generateContent(retryPrompt);
          optimizedSummary = retryResult.response.text().trim();
          
          const retryCheck = validateOptimizedSummary(optimizedSummary);
          if (!retryCheck.isValid) {
            console.error(`  ❌ 再試行も失敗: ${retryCheck.reason}`);
            errorCount++;
            results.push({
              id: articleId,
              title: article.title,
              status: 'failed',
              reason: retryCheck.reason
            });
            continue;
          }
        }
        
        console.error(`  ✅ 最適化後: ${optimizedSummary}`);
        console.error(`  📏 新しい文字数: ${optimizedSummary.length}文字`);
        
        // データベースを更新
        await prisma.article.update({
          where: { id: articleId },
          data: {
            summary: optimizedSummary,
            updatedAt: new Date()
          }
        });
        
        successCount++;
        results.push({
          id: articleId,
          title: article.title,
          oldSummary: article.summary,
          oldLength: article.summary?.length,
          newSummary: optimizedSummary,
          newLength: optimizedSummary.length,
          status: 'success'
        });
        
        // API制限対策のため少し待機
        if (i < longSummaryIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`  ❌ エラー: ${error}`);
        errorCount++;
        results.push({
          id: articleId,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // 結果サマリー
    console.error('\n' + '='.repeat(60));
    console.error('📊 処理結果サマリー\n');
    console.error(`✅ 成功: ${successCount}件`);
    console.error(`❌ エラー: ${errorCount}件`);
    console.error(`📈 成功率: ${((successCount / longSummaryIds.length) * 100).toFixed(1)}%`);
    
    // 平均文字数の改善を計算
    const successfulResults = results.filter(r => r.status === 'success');
    if (successfulResults.length > 0) {
      const avgOldLength = successfulResults.reduce((sum, r) => sum + r.oldLength, 0) / successfulResults.length;
      const avgNewLength = successfulResults.reduce((sum, r) => sum + r.newLength, 0) / successfulResults.length;
      console.error(`\n📏 平均文字数の変化:`);
      console.error(`  変更前: ${avgOldLength.toFixed(1)}文字`);
      console.error(`  変更後: ${avgNewLength.toFixed(1)}文字`);
      console.error(`  削減率: ${((1 - avgNewLength / avgOldLength) * 100).toFixed(1)}%`);
    }
    
    // 結果をファイルに保存
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultFile = `optimize-long-summaries-result-${timestamp}.json`;
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalProcessed: longSummaryIds.length,
      successCount,
      errorCount,
      results
    }, null, 2));
    
    console.error(`\n📁 詳細な結果を ${resultFile} に保存しました`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 最適化された要約の品質を検証
function validateOptimizedSummary(summary: string): { isValid: boolean; reason?: string } {
  if (!summary || summary.trim() === '') {
    return { isValid: false, reason: '要約が空です' };
  }
  
  const trimmed = summary.trim();
  
  // 文字数チェック（100-120文字を目標、80-140文字まで許容）
  if (trimmed.length < 80) {
    return { isValid: false, reason: `文字数が少なすぎます（${trimmed.length}文字）` };
  }
  
  if (trimmed.length > 140) {
    return { isValid: false, reason: `まだ長すぎます（${trimmed.length}文字）` };
  }
  
  // 日本語率チェック
  const japaneseChars = (trimmed.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
  const japaneseRatio = japaneseChars / trimmed.length;
  
  if (japaneseRatio < 0.3) {
    return { isValid: false, reason: `日本語が少なすぎます（${(japaneseRatio * 100).toFixed(1)}%）` };
  }
  
  // 不適切な表現チェック
  if (trimmed.includes('...') && trimmed.endsWith('...')) {
    return { isValid: false, reason: '省略記号で終わっています' };
  }
  
  return { isValid: true };
}

// メイン実行
optimizeLongSummaries().catch(console.error);