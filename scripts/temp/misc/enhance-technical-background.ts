#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../../lib/ai/gemini';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function enhanceTechnicalBackground() {
  console.error('🎯 詳細要約に技術的背景を追加します\n');
  console.error('=' .repeat(60));
  
  try {
    // 問題のある記事IDを読み込み
    const problemData = JSON.parse(fs.readFileSync('problem-articles.json', 'utf-8'));
    
    // 技術的背景が欠如している記事IDを取得
    const noTechnicalBgIds = problemData.details.detailedNoTechnicalBg;
    
    console.error(`対象記事数: ${noTechnicalBgIds.length}件`);
    console.error('目標: 技術的背景を含む適切な詳細要約に改善\n');
    
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
    
    for (let i = 0; i < noTechnicalBgIds.length; i++) {
      const articleId = noTechnicalBgIds[i];
      console.error(`\n[${i + 1}/${noTechnicalBgIds.length}] 処理中: ${articleId}`);
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
        console.error(`  📝 現在の詳細要約の先頭:`);
        const currentLines = article.detailedSummary?.split('\n').filter(l => l.trim());
        console.error(`     ${currentLines?.[0]?.substring(0, 60)}...`);
        
        // 詳細要約を再生成
        console.error(`  🔄 詳細要約を再生成中...`);
        
        // コンテンツを準備
        const content = article.content || article.summary || article.title || '';
        
        // 新しい詳細要約を生成（詳細要約だけが必要）
        const result = await geminiClient.generateDetailedSummary(
          article.title || '',
          content
        );
        const newDetailedSummary = result.detailedSummary;
        
        // 品質チェック
        const qualityCheck = validateDetailedSummary(newDetailedSummary);
        
        if (!qualityCheck.isValid) {
          console.error(`  ⚠️ 生成された詳細要約が基準を満たしていません: ${qualityCheck.reason}`);
          
          // 再試行（より明確な指示で）
          const retryPrompt = `
技術記事「${article.title}」の詳細要約を作成してください。
必ず以下の形式で作成してください：

・記事の主題は〜（使用技術、前提知識を含む）
・具体的な問題は〜
・提示されている解決策は〜
・実装方法・手順は〜
・利点・効果は〜
・注意点・制限事項は〜
・今後の展望・応用可能性は〜

各項目は「・」で始め、6項目以上含めてください。`;
          
          const model = geminiClient.model;
          const retryResult = await model.generateContent(retryPrompt);
          const retrySummary = retryResult.response.text().trim();
          
          const retryCheck = validateDetailedSummary(retrySummary);
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
          } else {
            await updateDetailedSummary(articleId, retrySummary);
            successCount++;
            console.error(`  ✅ 再試行成功 - 技術的背景を追加`);
            results.push({
              id: articleId,
              title: article.title,
              oldDetailedSummary: article.detailedSummary,
              newDetailedSummary: retrySummary,
              status: 'success'
            });
          }
        } else {
          console.error(`  ✅ 新しい詳細要約の先頭:`);
          const newLines = newDetailedSummary.split('\n').filter(l => l.trim());
          console.error(`     ${newLines[0]?.substring(0, 60)}...`);
          console.error(`  📊 項目数: ${newLines.length}項目`);
          
          // データベースを更新
          await updateDetailedSummary(articleId, newDetailedSummary);
          successCount++;
          results.push({
            id: articleId,
            title: article.title,
            oldDetailedSummary: article.detailedSummary,
            newDetailedSummary,
            status: 'success'
          });
        }
        
        // API制限対策のため少し待機
        if (i < noTechnicalBgIds.length - 1) {
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
    console.error(`📈 成功率: ${((successCount / noTechnicalBgIds.length) * 100).toFixed(1)}%`);
    
    // 結果をファイルに保存
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultFile = `enhance-technical-background-result-${timestamp}.json`;
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalProcessed: noTechnicalBgIds.length,
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

// 詳細要約の品質を検証
function validateDetailedSummary(summary: string): { isValid: boolean; reason?: string } {
  if (!summary || summary.trim() === '') {
    return { isValid: false, reason: '詳細要約が空です' };
  }
  
  const trimmed = summary.trim();
  const lines = trimmed.split('\n').filter(l => l.trim().startsWith('・'));
  
  // 項目数チェック（最低6項目）
  if (lines.length < 6) {
    return { isValid: false, reason: `項目数が不足しています（${lines.length}項目）` };
  }
  
  // 技術的背景チェック（最初の項目）
  if (lines.length > 0) {
    const firstLine = lines[0];
    if (!firstLine.includes('記事の主題は') && !firstLine.includes('主題は') && !firstLine.includes('技術的背景')) {
      return { isValid: false, reason: '技術的背景が含まれていません' };
    }
  }
  
  // 各行が箇条書き形式かチェック
  const invalidLines = trimmed.split('\n').filter(l => {
    const trimmedLine = l.trim();
    return trimmedLine !== '' && !trimmedLine.startsWith('・');
  });
  
  if (invalidLines.length > 0) {
    return { isValid: false, reason: `箇条書き形式でない行があります（${invalidLines.length}行）` };
  }
  
  // 日本語率チェック
  const japaneseChars = (trimmed.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
  const japaneseRatio = japaneseChars / trimmed.length;
  
  if (japaneseRatio < 0.3) {
    return { isValid: false, reason: `日本語が少なすぎます（${(japaneseRatio * 100).toFixed(1)}%）` };
  }
  
  return { isValid: true };
}

// 詳細要約を更新
async function updateDetailedSummary(articleId: string, newDetailedSummary: string) {
  await prisma.article.update({
    where: { id: articleId },
    data: {
      detailedSummary: newDetailedSummary,
      updatedAt: new Date()
    }
  });
}

// メイン実行
enhanceTechnicalBackground().catch(console.error);