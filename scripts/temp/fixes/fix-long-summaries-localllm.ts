#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import * as fs from 'fs';

const prisma = new PrismaClient();

// localLLMを使って要約を短縮
async function shortenWithLocalLLM(summary: string, targetLength: number = 180): Promise<string> {
  return new Promise((resolve, reject) => {
    const prompt = `以下の要約を${targetLength}文字程度に短縮してください。重要な技術的内容は保持し、冗長な表現を削除してください。

現在の要約（${summary.length}文字）:
${summary}

短縮版（${targetLength}文字程度、最大200文字）:`;

    // localLLMコマンドを実行（ollama等を想定）
    const child = spawn('ollama', ['run', 'gemma2:2b', '--'], {
      shell: false
    });

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`localLLM exited with code ${code}: ${error}`));
      } else {
        const result = output.trim()
          .replace(/^短縮版[:：]\s*/i, '')
          .replace(/^要約[:：]\s*/i, '')
          .trim();
        resolve(result);
      }
    });

    // プロンプトを送信
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// 複数回試行して最適な結果を得る
async function tryMultipleTimes(summary: string, maxAttempts: number = 3): Promise<string | null> {
  const attempts: { summary: string; length: number; score: number }[] = [];
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      console.log(`    試行 ${i + 1}/${maxAttempts}...`);
      
      // 目標文字数を段階的に調整（180→170→160）
      const targetLength = 180 - (i * 10);
      const newSummary = await shortenWithLocalLLM(summary, targetLength);
      
      if (!newSummary || newSummary.length < 80) {
        console.log(`      短すぎ: ${newSummary?.length || 0}文字`);
        continue;
      }
      
      if (newSummary.length > 200) {
        console.log(`      長すぎ: ${newSummary.length}文字`);
        continue;
      }
      
      // 日本語チェック
      const japaneseChars = (newSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
      const japaneseRatio = japaneseChars / newSummary.length;
      
      if (japaneseRatio < 0.3) {
        console.log(`      日本語が少ない: ${(japaneseRatio * 100).toFixed(1)}%`);
        continue;
      }
      
      // スコア計算（150-180文字が最高スコア）
      let score = 100;
      if (newSummary.length < 150) {
        score -= (150 - newSummary.length) * 0.5;
      } else if (newSummary.length > 180) {
        score -= (newSummary.length - 180) * 1.5;
      }
      
      attempts.push({
        summary: newSummary,
        length: newSummary.length,
        score
      });
      
      console.log(`      成功: ${newSummary.length}文字 (スコア: ${score.toFixed(1)})`);
      
    } catch (error) {
      console.log(`      エラー: ${error}`);
    }
    
    // 少し待機
    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // 最高スコアの結果を返す
  if (attempts.length === 0) {
    return null;
  }
  
  attempts.sort((a, b) => b.score - a.score);
  return attempts[0].summary;
}

async function fixLongSummariesWithLocalLLM() {
  console.log('📝 localLLMを使用して長すぎる要約（250文字超）を短縮します\n');
  console.log('=' .repeat(60));
  console.log('目標: 150-180文字（最大200文字）\n');
  
  // ollamaが利用可能か確認
  try {
    const testChild = spawn('ollama', ['list'], { shell: false });
    await new Promise((resolve, reject) => {
      testChild.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('ollama is not available'));
        } else {
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('❌ ollamaが利用できません。以下のコマンドでインストールしてください:');
    console.error('   curl -fsSL https://ollama.com/install.sh | sh');
    console.error('   ollama pull gemma2:2b');
    process.exit(1);
  }
  
  try {
    // 250文字を超える要約を持つ記事を取得
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
    
    // 250文字超をフィルタリング
    const articlesToFix = longArticles.filter(a => {
      if (!a.summary) return false;
      return a.summary.length > 250;
    });
    
    console.log(`対象記事数: ${articlesToFix.length}件\n`);
    
    // 処理履歴の読み込み
    const progressFile = 'fix-long-summaries-localllm-progress.json';
    let processedIds: Set<string> = new Set();
    
    if (fs.existsSync(progressFile)) {
      const progress = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
      processedIds = new Set(progress.processedIds || []);
      console.log(`📂 前回の進捗を読み込みました: ${processedIds.size}件処理済み\n`);
    }
    
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;
    const results: any[] = [];
    
    for (let i = 0; i < articlesToFix.length; i++) {
      const article = articlesToFix[i];
      
      // 既に処理済みならスキップ
      if (processedIds.has(article.id)) {
        skipCount++;
        continue;
      }
      
      if ((i - skipCount) % 10 === 0 && (i - skipCount) > 0) {
        console.log(`\n📊 進捗: ${i}/${articlesToFix.length} (${Math.round(i/articlesToFix.length*100)}%)\n`);
        
        // 進捗を保存
        fs.writeFileSync(progressFile, JSON.stringify({
          processedIds: Array.from(processedIds),
          timestamp: new Date().toISOString()
        }, null, 2));
      }
      
      console.log(`[${i + 1}/${articlesToFix.length}] ${article.id}`);
      console.log(`  📄 タイトル: ${article.title?.substring(0, 50)}...`);
      console.log(`  📏 現在の文字数: ${article.summary?.length}文字`);
      
      try {
        // 複数回試行して最適な結果を得る
        const newSummary = await tryMultipleTimes(article.summary || '', 3);
        
        if (!newSummary) {
          throw new Error('すべての試行が失敗しました');
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
        processedIds.add(article.id);
        
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
        processedIds.add(article.id); // エラーでも処理済みとしてマーク
        
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
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // 結果サマリー
    console.log('\n' + '='.repeat(60));
    console.log('📊 処理結果サマリー\n');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ エラー: ${errorCount}件`);
    console.log(`⏭️ スキップ（処理済み）: ${skipCount}件`);
    console.log(`📈 成功率: ${((successCount / (successCount + errorCount)) * 100).toFixed(1)}%`);
    
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
    const resultFile = `fix-long-summaries-localllm-result-${timestamp}.json`;
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalProcessed: articlesToFix.length,
      successCount,
      errorCount,
      skipCount,
      results
    }, null, 2));
    
    console.log(`\n📁 詳細な結果を ${resultFile} に保存しました`);
    
    // 進捗ファイルを削除（完了したため）
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
      console.log(`✅ 進捗ファイルを削除しました`);
    }
    
  } catch (error) {
    console.error('致命的エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン実行
fixLongSummariesWithLocalLLM().catch(console.error);