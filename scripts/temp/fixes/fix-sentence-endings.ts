#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function fixSentenceEndings() {
  console.error('✂️ 文末が不完全な要約を修正します\n');
  console.error('=' .repeat(60));
  
  try {
    // 問題のある記事IDを読み込み
    const problemData = JSON.parse(fs.readFileSync('problem-articles.json', 'utf-8'));
    
    // 文末が不完全な記事IDを取得
    const incompleteEndingIds = problemData.details.summaryIncomplete;
    
    console.error(`対象記事数: ${incompleteEndingIds.length}件`);
    console.error('目標: 適切な句読点で終わる完全な文章に修正\n');
    
    // 処理結果の記録
    let successCount = 0;
    let skipCount = 0;
    const results: any[] = [];
    
    for (let i = 0; i < incompleteEndingIds.length; i++) {
      const articleId = incompleteEndingIds[i];
      console.error(`\n[${i + 1}/${incompleteEndingIds.length}] 処理中: ${articleId}`);
      console.error('-'.repeat(40));
      
      try {
        // 記事を取得
        const article = await prisma.article.findUnique({
          where: { id: articleId },
          include: { source: true }
        });
        
        if (!article || !article.summary) {
          console.error(`  ⚠️ 記事または要約が見つかりません`);
          skipCount++;
          continue;
        }
        
        console.error(`  📄 タイトル: ${article.title?.substring(0, 50)}...`);
        console.error(`  🏷️ ソース: ${article.source?.name}`);
        console.error(`  📝 現在の要約: ${article.summary}`);
        console.error(`  📏 文字数: ${article.summary.length}文字`);
        
        // 文末を修正
        const fixedSummary = fixSentenceEnding(article.summary);
        
        if (fixedSummary === article.summary) {
          console.error(`  ℹ️ 修正不要（既に適切な文末）`);
          skipCount++;
          results.push({
            id: articleId,
            title: article.title,
            summary: article.summary,
            status: 'skipped',
            reason: '既に適切な文末'
          });
          continue;
        }
        
        console.error(`  ✅ 修正後: ${fixedSummary}`);
        console.error(`  📏 文字数: ${fixedSummary.length}文字`);
        
        // データベースを更新
        await prisma.article.update({
          where: { id: articleId },
          data: {
            summary: fixedSummary,
            updatedAt: new Date()
          }
        });
        
        successCount++;
        results.push({
          id: articleId,
          title: article.title,
          oldSummary: article.summary,
          newSummary: fixedSummary,
          status: 'success'
        });
        
      } catch (error) {
        console.error(`  ❌ エラー: ${error}`);
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
    console.error(`✅ 修正成功: ${successCount}件`);
    console.error(`⏭️ スキップ: ${skipCount}件`);
    console.error(`📈 処理率: ${((successCount + skipCount) / incompleteEndingIds.length * 100).toFixed(1)}%`);
    
    // 結果をファイルに保存
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultFile = `fix-sentence-endings-result-${timestamp}.json`;
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalProcessed: incompleteEndingIds.length,
      successCount,
      skipCount,
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

// 文末を修正する関数
function fixSentenceEnding(summary: string): string {
  if (!summary) return summary;
  
  const trimmed = summary.trim();
  
  // 既に適切な文末の場合はそのまま返す
  const validEndings = ['。', '）', '」', '!', '?', '.', '！', '？'];
  const lastChar = trimmed[trimmed.length - 1];
  
  if (validEndings.includes(lastChar)) {
    return trimmed;
  }
  
  // 文末が不完全な場合の処理
  
  // 1. 明らかに途切れている場合（「の」「が」「を」「に」「と」「で」など）
  const particleEndings = ['の', 'が', 'を', 'に', 'と', 'で', 'へ', 'から', 'まで', 'より'];
  if (particleEndings.includes(lastChar)) {
    // 文脈から判断して適切な終止を追加
    if (trimmed.includes('方法') || trimmed.includes('手法') || trimmed.includes('技術')) {
      return trimmed + 'ついて解説。';
    } else if (trimmed.includes('問題') || trimmed.includes('課題')) {
      return trimmed + 'ついて説明。';
    } else {
      return trimmed + 'ついて紹介。';
    }
  }
  
  // 2. 動詞の連用形で終わっている場合
  if (trimmed.endsWith('し') || trimmed.endsWith('して')) {
    return trimmed.replace(/し(て)?$/, 'する。');
  }
  
  if (trimmed.endsWith('され') || trimmed.endsWith('されて')) {
    return trimmed.replace(/され(て)?$/, 'される。');
  }
  
  if (trimmed.endsWith('でき')) {
    return trimmed + 'る。';
  }
  
  // 3. 名詞で終わっている場合
  // 技術系の記事では名詞止めも一般的なので、句点を追加
  if (!lastChar.match(/[、,]/)) {
    // 最後が読点でない場合は句点を追加
    return trimmed + '。';
  }
  
  // 4. 読点で終わっている場合
  if (lastChar === '、' || lastChar === ',') {
    // 読点を句点に置き換え
    return trimmed.slice(0, -1) + '。';
  }
  
  // その他の場合はそのまま句点を追加
  return trimmed + '。';
}

// メイン実行
fixSentenceEndings().catch(console.error);