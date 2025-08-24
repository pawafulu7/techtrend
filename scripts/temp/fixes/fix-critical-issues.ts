#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../lib/ai/gemini';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface ProblemArticle {
  id: string;
  title?: string;
  summary?: string;
  content?: string;
  source?: { name: string };
  problemType: string;
}

async function fixCriticalIssues() {
  console.error('🚨 重大な品質問題を修正します\n');
  console.error('=' .repeat(60));
  
  try {
    // 問題のある記事IDを読み込み
    const problemData = JSON.parse(fs.readFileSync('problem-articles.json', 'utf-8'));
    
    // 高優先度の問題記事を特定
    const criticalIds = [
      ...problemData.details.summaryTooShort,  // 短すぎる要約
      ...problemData.details.summaryUnclear,    // 不明瞭な内容
    ];
    
    console.error(`対象記事数: ${criticalIds.length}件\n`);
    
    // Gemini API キーの確認
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('❌ GEMINI_API_KEY が設定されていません');
      console.error('環境変数 GEMINI_API_KEY を設定してください');
      process.exit(1);
    }
    
    const geminiClient = new GeminiClient(geminiApiKey);
    
    // 各記事を処理
    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];
    
    for (const articleId of criticalIds) {
      console.error(`\n処理中: ${articleId}`);
      console.error('-'.repeat(40));
      
      try {
        // 記事を取得
        const article = await prisma.article.findUnique({
          where: { id: articleId },
          include: { source: true }
        });
        
        if (!article) {
          console.error(`  ⚠️ 記事が見つかりません: ${articleId}`);
          errorCount++;
          continue;
        }
        
        // 問題の種類を特定
        let problemType = '';
        if (problemData.details.summaryTooShort.includes(articleId)) {
          problemType = '短すぎる要約';
        } else if (problemData.details.summaryUnclear.includes(articleId)) {
          problemType = '不明瞭な内容';
        }
        
        console.error(`  📄 タイトル: ${article.title?.substring(0, 50)}...`);
        console.error(`  🏷️ ソース: ${article.source?.name}`);
        console.error(`  ⚠️ 問題: ${problemType}`);
        console.error(`  📝 現在の要約: ${article.summary?.substring(0, 80)}...`);
        console.error(`  📏 現在の文字数: ${article.summary?.length || 0}文字`);
        
        // 要約を再生成
        console.error(`  🔄 要約を再生成中...`);
        
        // コンテンツを準備（contentがない場合は既存の要約やタイトルから生成）
        const content = article.content || article.detailedSummary || article.summary || '';
        
        if (!content && article.title) {
          console.error(`  ⚠️ コンテンツが不足しているため、タイトルベースで生成`);
        }
        
        // 新しい要約を生成
        const newSummary = await geminiClient.generateSummary(
          article.title || '',
          content || article.title || ''
        );
        
        // 品質チェック
        const qualityCheck = validateSummary(newSummary);
        
        if (!qualityCheck.isValid) {
          console.error(`  ⚠️ 生成された要約が品質基準を満たしていません: ${qualityCheck.reason}`);
          console.error(`  🔄 再試行中...`);
          
          // 再試行（より詳細な指示で）
          const retryContent = `タイトル: ${article.title}\n内容: ${content}`;
          const retrySummary = await geminiClient.generateSummary(article.title || '', retryContent);
          
          const retryCheck = validateSummary(retrySummary);
          if (retryCheck.isValid) {
            console.error(`  ✅ 再試行成功`);
            await updateArticle(articleId, retrySummary);
            successCount++;
            results.push({
              id: articleId,
              title: article.title,
              oldSummary: article.summary,
              newSummary: retrySummary,
              problemType,
              status: 'success'
            });
          } else {
            console.error(`  ❌ 再試行も失敗: ${retryCheck.reason}`);
            errorCount++;
            results.push({
              id: articleId,
              title: article.title,
              problemType,
              status: 'failed',
              reason: retryCheck.reason
            });
          }
        } else {
          console.error(`  ✅ 新しい要約: ${newSummary.substring(0, 80)}...`);
          console.error(`  📏 新しい文字数: ${newSummary.length}文字`);
          
          // データベースを更新
          await updateArticle(articleId, newSummary);
          successCount++;
          results.push({
            id: articleId,
            title: article.title,
            oldSummary: article.summary,
            newSummary,
            problemType,
            status: 'success'
          });
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
    console.error(`📈 成功率: ${((successCount / criticalIds.length) * 100).toFixed(1)}%`);
    
    // 結果をファイルに保存
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultFile = `fix-critical-issues-result-${timestamp}.json`;
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalProcessed: criticalIds.length,
      successCount,
      errorCount,
      results
    }, null, 2));
    
    console.error(`\n📁 詳細な結果を ${resultFile} に保存しました`);
    
    // 品質チェックを再実行して確認
    console.error('\n🔍 修正後の品質チェックを実行中...');
    const remainingProblems = await checkRemainingProblems(criticalIds);
    
    if (remainingProblems.length === 0) {
      console.error('✅ すべての重大問題が解決されました！');
    } else {
      console.error(`⚠️ まだ ${remainingProblems.length}件の問題が残っています`);
      remainingProblems.forEach(p => {
        console.error(`  - ${p.id}: ${p.problem}`);
      });
    }
    
  } catch (error) {
    console.error('致命的エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 要約の品質を検証
function validateSummary(summary: string): { isValid: boolean; reason?: string } {
  if (!summary || summary.trim() === '') {
    return { isValid: false, reason: '要約が空です' };
  }
  
  const trimmed = summary.trim();
  
  // 文字数チェック（20-150文字）
  if (trimmed.length < 20) {
    return { isValid: false, reason: `文字数が少なすぎます（${trimmed.length}文字）` };
  }
  
  if (trimmed.length > 150) {
    return { isValid: false, reason: `文字数が多すぎます（${trimmed.length}文字）` };
  }
  
  // 日本語率チェック（30%以上）
  const japaneseChars = (trimmed.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
  const japaneseRatio = japaneseChars / trimmed.length;
  
  if (japaneseRatio < 0.3) {
    return { isValid: false, reason: `日本語が少なすぎます（${(japaneseRatio * 100).toFixed(1)}%）` };
  }
  
  // 不明瞭な表現チェック
  const unclearPhrases = [
    '不明', '記載なし', '情報なし', 'undefined', 'null', 'N/A',
    '提供されたテキスト', '記事内容が提示されていない', '詳細な内容は不明'
  ];
  
  for (const phrase of unclearPhrases) {
    if (trimmed.includes(phrase)) {
      return { isValid: false, reason: `不明瞭な表現が含まれています: "${phrase}"` };
    }
  }
  
  // 文末チェック
  const validEndings = ['。', '）', '」', '!', '?', '.'];
  const lastChar = trimmed[trimmed.length - 1];
  
  if (!validEndings.includes(lastChar)) {
    // 文末が不完全でも、文章として成立していれば許容
    // ただし、明らかに途切れている場合は無効
    if (trimmed.endsWith('の') || trimmed.endsWith('が') || trimmed.endsWith('を')) {
      return { isValid: false, reason: '文章が途中で切れています' };
    }
  }
  
  return { isValid: true };
}

// 記事を更新
async function updateArticle(articleId: string, newSummary: string) {
  await prisma.article.update({
    where: { id: articleId },
    data: {
      summary: newSummary,
      updatedAt: new Date()
    }
  });
}

// 残っている問題をチェック
async function checkRemainingProblems(articleIds: string[]): Promise<Array<{ id: string; problem: string }>> {
  const problems: Array<{ id: string; problem: string }> = [];
  
  for (const id of articleIds) {
    const article = await prisma.article.findUnique({
      where: { id },
      select: { summary: true }
    });
    
    if (!article || !article.summary) {
      problems.push({ id, problem: '要約なし' });
      continue;
    }
    
    const validation = validateSummary(article.summary);
    if (!validation.isValid) {
      problems.push({ id, problem: validation.reason || '不明な問題' });
    }
  }
  
  return problems;
}

// メイン実行
fixCriticalIssues().catch(console.error);