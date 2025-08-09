#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../lib/ai/gemini';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function fixLongSummaries() {
  console.log('📝 長すぎる要約（200文字超）を適切な長さに修正します\n');
  console.log('=' .repeat(60));
  console.log('目標: 100-200文字の範囲に収める\n');
  
  try {
    // Gemini API キーの確認
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('❌ GEMINI_API_KEY が設定されていません');
      process.exit(1);
    }
    
    const geminiClient = new GeminiClient(geminiApiKey);
    
    // 200文字を超える要約を持つ記事を取得
    const longArticles = await prisma.article.findMany({
      where: {
        summary: {
          not: null
        }
      },
      select: {
        id: true,
        title: true,
        summary: true,
        source: { select: { name: true } }
      }
    });
    
    // 200文字超をフィルタリング
    const articlesToFix = longArticles.filter(a => {
      if (!a.summary) return false;
      return a.summary.length > 200;
    });
    
    console.log(`対象記事数: ${articlesToFix.length}件\n`);
    
    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];
    
    for (let i = 0; i < articlesToFix.length; i++) {
      const article = articlesToFix[i];
      
      if (i % 10 === 0 && i > 0) {
        console.log(`\n📊 進捗: ${i}/${articlesToFix.length} (${Math.round(i/articlesToFix.length*100)}%)\n`);
      }
      
      console.log(`[${i + 1}/${articlesToFix.length}] ${article.id}`);
      console.log(`  📄 タイトル: ${article.title?.substring(0, 50)}...`);
      console.log(`  📏 現在の文字数: ${article.summary?.length}文字`);
      
      try {
        // プロンプトを作成（要約を短縮）
        const prompt = `
以下の要約を100〜200文字に短縮してください。
重要な技術的内容は保持し、冗長な表現を削除してください。

現在の要約（${article.summary?.length}文字）:
${article.summary}

短縮版（100〜200文字、できれば150文字前後）:`;
        
        const model = geminiClient.model;
        const result = await model.generateContent(prompt);
        let newSummary = result.response.text().trim()
          .replace(/^短縮版[:：]\s*/i, '')
          .replace(/^要約[:：]\s*/i, '')
          .replace(/^\*\*/g, '')
          .replace(/\*\*$/g, '')
          .trim();
        
        // 品質チェック
        if (!newSummary || newSummary.length < 80 || newSummary.length > 210) {
          // 210文字まで許容（若干の誤差）
          if (newSummary && newSummary.length > 210 && newSummary.length < 250) {
            // 210-250文字の場合は警告のみ
            console.log(`  ⚠️ 少し長め: ${newSummary.length}文字（許容）`);
          } else {
            throw new Error(`要約の長さが不適切: ${newSummary?.length || 0}文字`);
          }
        }
        
        // 日本語チェック
        const japaneseChars = (newSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const japaneseRatio = japaneseChars / newSummary.length;
        
        if (japaneseRatio < 0.3) {
          throw new Error(`日本語が少なすぎます: ${(japaneseRatio * 100).toFixed(1)}%`);
        }
        
        // 内容の大幅な変更がないかチェック（最初の20文字が似ているか）
        const originalStart = article.summary?.substring(0, 20) || '';
        const newStart = newSummary.substring(0, 20);
        const similarity = calculateSimilarity(originalStart, newStart);
        
        if (similarity < 0.3) {
          console.log(`  ⚠️ 内容が大きく変わった可能性があります`);
        }
        
        // データベース更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: newSummary,
            updatedAt: new Date()
          }
        });
        
        console.log(`  ✅ 成功: ${article.summary?.length}文字 → ${newSummary.length}文字`);
        
        successCount++;
        results.push({
          id: article.id,
          title: article.title,
          oldSummary: article.summary,
          newSummary: newSummary,
          oldLength: article.summary?.length,
          newLength: newSummary.length,
          status: 'success'
        });
        
      } catch (error) {
        console.error(`  ❌ エラー: ${error}`);
        errorCount++;
        results.push({
          id: article.id,
          title: article.title,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          oldLength: article.summary?.length
        });
      }
      
      // API制限対策
      if (i < articlesToFix.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    // 結果サマリー
    console.log('\n' + '='.repeat(60));
    console.log('📊 処理結果サマリー\n');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ エラー: ${errorCount}件`);
    console.log(`📈 成功率: ${((successCount / articlesToFix.length) * 100).toFixed(1)}%`);
    
    // 平均文字数の改善
    const successfulResults = results.filter(r => r.status === 'success');
    if (successfulResults.length > 0) {
      const avgOldLength = successfulResults.reduce((sum, r) => sum + (r.oldLength || 0), 0) / successfulResults.length;
      const avgNewLength = successfulResults.reduce((sum, r) => sum + r.newLength, 0) / successfulResults.length;
      console.log(`\n📏 平均文字数の変化:`);
      console.log(`  変更前: ${avgOldLength.toFixed(1)}文字`);
      console.log(`  変更後: ${avgNewLength.toFixed(1)}文字`);
      console.log(`  削減率: ${((1 - avgNewLength / avgOldLength) * 100).toFixed(1)}%`);
    }
    
    // 結果をファイルに保存
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultFile = `fix-long-summaries-result-${timestamp}.json`;
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalProcessed: articlesToFix.length,
      successCount,
      errorCount,
      results
    }, null, 2));
    
    console.log(`\n📁 詳細な結果を ${resultFile} に保存しました`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 文字列の類似度を計算（簡易版）
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) {
    return 1.0;
  }
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

// レーベンシュタイン距離（編集距離）
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// メイン実行
fixLongSummaries().catch(console.error);