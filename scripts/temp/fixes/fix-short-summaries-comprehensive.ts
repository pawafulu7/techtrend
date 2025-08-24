#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../../lib/ai/gemini';

const prisma = new PrismaClient();

// 特に問題のある記事のID（優先的に修正）
const priorityIds = [
  'cme30itig0006tea4sexgulpy', // ユーザーから指摘された記事
];

async function fixShortSummaries() {
  console.error('📝 短すぎる要約を適切な長さに修正します\n');
  console.error('=' .repeat(60));
  
  try {
    // Gemini API キーの確認
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('❌ GEMINI_API_KEY が設定されていません');
      process.exit(1);
    }
    
    const geminiClient = new GeminiClient(geminiApiKey);
    
    // 60文字未満の短い要約を持つ記事を取得
    const shortArticles = await prisma.article.findMany({
      where: {
        summary: {
          not: null
        }
      },
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        detailedSummary: true,
        source: { select: { name: true } }
      }
    });
    
    // 短い要約（60文字未満）をフィルタリング
    const articlesToFix = shortArticles.filter(a => {
      if (!a.summary) return false;
      const length = a.summary.length;
      // 優先IDは必ず処理
      if (priorityIds.includes(a.id)) return true;
      // 60文字未満で内容が不十分そうなもの
      return length < 60;
    });
    
    // 優先記事を先頭に並べる
    articlesToFix.sort((a, b) => {
      const aPriority = priorityIds.includes(a.id) ? 0 : 1;
      const bPriority = priorityIds.includes(b.id) ? 0 : 1;
      return aPriority - bPriority;
    });
    
    // 処理を30件に制限（API制限対策）
    const targetArticles = articlesToFix.slice(0, 30);
    
    console.error(`対象記事数: ${targetArticles.length}件`);
    console.error('目標: 80〜120文字の適切な要約に修正\n');
    
    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];
    
    for (let i = 0; i < targetArticles.length; i++) {
      const article = targetArticles[i];
      const isPriority = priorityIds.includes(article.id);
      
      console.error(`\n[${i + 1}/${targetArticles.length}] 処理中: ${article.id}`);
      if (isPriority) {
        console.error('  ⭐ 優先記事');
      }
      console.error('-'.repeat(40));
      
      try {
        console.error(`  📄 タイトル: ${article.title?.substring(0, 50)}...`);
        console.error(`  🏷️ ソース: ${article.source?.name}`);
        console.error(`  📝 現在の要約: ${article.summary}`);
        console.error(`  📏 現在の文字数: ${article.summary?.length || 0}文字`);
        
        // コンテンツを準備（優先順位: content > detailedSummary > title）
        let sourceContent = article.content || '';
        
        if (!sourceContent && article.detailedSummary) {
          // contentがない場合は詳細要約から生成
          sourceContent = `タイトル: ${article.title}\n\n詳細内容:\n${article.detailedSummary}`;
        } else if (!sourceContent) {
          // それもない場合はタイトルから生成
          sourceContent = article.title || '';
        }
        
        // 新しい要約を生成
        console.error(`  🔄 要約を生成中...`);
        
        // タイトルと内容を明確に伝える
        const fullContent = `記事タイトル: ${article.title}\n\n記事内容:\n${sourceContent}`;
        
        const newSummary = await geminiClient.generateSummary(
          article.title || '',
          fullContent
        );
        
        // 品質チェック
        if (!newSummary || newSummary.length < 80 || newSummary.length > 150) {
          // 長さが不適切な場合は再試行
          console.error(`  ⚠️ 生成された要約の長さが不適切（${newSummary?.length || 0}文字）、再試行中...`);
          
          const retryPrompt = `
以下の記事の要約を80〜120文字で作成してください。
技術的な内容と主要なポイントを含めてください。

タイトル: ${article.title}
内容: ${sourceContent.substring(0, 1000)}

要約（80〜120文字）:`;
          
          const model = geminiClient.model;
          const retryResult = await model.generateContent(retryPrompt);
          const retrySummary = retryResult.response.text().trim()
            .replace(/^要約[:：]\s*/i, '')
            .replace(/^\*\*/g, '')
            .replace(/\*\*$/g, '')
            .trim();
          
          if (retrySummary && retrySummary.length >= 70 && retrySummary.length <= 150) {
            console.error(`  ✅ 再試行成功: ${retrySummary}`);
            console.error(`  📏 新しい文字数: ${retrySummary.length}文字`);
            
            await prisma.article.update({
              where: { id: article.id },
              data: {
                summary: retrySummary,
                updatedAt: new Date()
              }
            });
            
            successCount++;
            results.push({
              id: article.id,
              title: article.title,
              oldSummary: article.summary,
              newSummary: retrySummary,
              oldLength: article.summary?.length,
              newLength: retrySummary.length,
              status: 'success'
            });
          } else {
            throw new Error(`要約の長さが不適切: ${retrySummary?.length || 0}文字`);
          }
        } else {
          console.error(`  ✅ 新しい要約: ${newSummary}`);
          console.error(`  📏 新しい文字数: ${newSummary.length}文字`);
          
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: newSummary,
              updatedAt: new Date()
            }
          });
          
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
        }
        
        // API制限対策
        if (i < targetArticles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
      } catch (error) {
        console.error(`  ❌ エラー: ${error}`);
        errorCount++;
        results.push({
          id: article.id,
          title: article.title,
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
    console.error(`📈 成功率: ${((successCount / targetArticles.length) * 100).toFixed(1)}%`);
    
    // 平均文字数の改善
    const successfulResults = results.filter(r => r.status === 'success');
    if (successfulResults.length > 0) {
      const avgOldLength = successfulResults.reduce((sum, r) => sum + (r.oldLength || 0), 0) / successfulResults.length;
      const avgNewLength = successfulResults.reduce((sum, r) => sum + r.newLength, 0) / successfulResults.length;
      console.error(`\n📏 平均文字数の変化:`);
      console.error(`  変更前: ${avgOldLength.toFixed(1)}文字`);
      console.error(`  変更後: ${avgNewLength.toFixed(1)}文字`);
      console.error(`  改善率: ${((avgNewLength / avgOldLength - 1) * 100).toFixed(1)}%`);
    }
    
    // 優先記事の処理結果を特別に表示
    const priorityResults = results.filter(r => priorityIds.includes(r.id));
    if (priorityResults.length > 0) {
      console.error('\n⭐ 優先記事の処理結果:');
      priorityResults.forEach(r => {
        if (r.status === 'success') {
          console.error(`  ✅ ${r.id}:`);
          console.error(`     旧: ${r.oldSummary}`);
          console.error(`     新: ${r.newSummary}`);
        } else {
          console.error(`  ❌ ${r.id}: ${r.error}`);
        }
      });
    }
    
    // 結果をファイルに保存
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultFile = `fix-short-summaries-result-${timestamp}.json`;
    const fs = require('fs');
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalProcessed: targetArticles.length,
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

// メイン実行
fixShortSummaries().catch(console.error);