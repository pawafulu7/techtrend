#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../lib/ai/gemini';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// 進捗状態を保存するファイル
const PROGRESS_FILE = 'fix-all-short-summaries-progress.json';
const BATCH_SIZE = 50;
const API_DELAY = 1500; // 1.5秒

interface ProgressData {
  processedIds: string[];
  successCount: number;
  errorCount: number;
  skipCount: number;
  lastProcessedAt: string;
}

// 進捗の読み込み
function loadProgress(): ProgressData {
  if (fs.existsSync(PROGRESS_FILE)) {
    const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return {
    processedIds: [],
    successCount: 0,
    errorCount: 0,
    skipCount: 0,
    lastProcessedAt: new Date().toISOString()
  };
}

// 進捗の保存
function saveProgress(progress: ProgressData) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function fixAllShortSummaries() {
  console.log('📝 すべての短い要約を修正します\n');
  console.log('=' .repeat(60));
  
  // 進捗の読み込み
  const progress = loadProgress();
  
  if (progress.processedIds.length > 0) {
    console.log(`📊 前回の進捗を検出:`);
    console.log(`  処理済み: ${progress.processedIds.length}件`);
    console.log(`  成功: ${progress.successCount}件`);
    console.log(`  エラー: ${progress.errorCount}件`);
    console.log(`  スキップ: ${progress.skipCount}件`);
    console.log(`  最終処理: ${progress.lastProcessedAt}\n`);
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>((resolve) => {
      rl.question('続きから処理を再開しますか？ (y/n): ', resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== 'y') {
      console.log('新規に処理を開始します。');
      progress.processedIds = [];
      progress.successCount = 0;
      progress.errorCount = 0;
      progress.skipCount = 0;
    }
  }
  
  try {
    // Gemini API キーの確認
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('❌ GEMINI_API_KEY が設定されていません');
      process.exit(1);
    }
    
    const geminiClient = new GeminiClient(geminiApiKey);
    
    // 80文字未満の短い要約を持つ記事を取得
    const shortArticles = await prisma.article.findMany({
      where: {
        AND: [
          {
            summary: {
              not: null
            }
          },
          {
            id: {
              notIn: progress.processedIds
            }
          }
        ]
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
    
    // 80文字未満をフィルタリング
    const articlesToProcess = shortArticles.filter(a => {
      if (!a.summary) return false;
      return a.summary.length < 80;
    });
    
    console.log(`対象記事数: ${articlesToProcess.length}件`);
    console.log(`バッチサイズ: ${BATCH_SIZE}件`);
    console.log(`推定処理時間: ${Math.ceil(articlesToProcess.length * API_DELAY / 1000 / 60)}分\n`);
    
    // 結果記録用
    const results: any[] = [];
    const startTime = Date.now();
    
    // バッチ処理
    const totalBatches = Math.ceil(articlesToProcess.length / BATCH_SIZE);
    
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const batchStart = batchNum * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, articlesToProcess.length);
      const batchArticles = articlesToProcess.slice(batchStart, batchEnd);
      
      console.log(`\n📦 バッチ ${batchNum + 1}/${totalBatches} (${batchArticles.length}件)`);
      console.log('=' .repeat(40));
      
      for (let i = 0; i < batchArticles.length; i++) {
        const article = batchArticles[i];
        const globalIndex = batchStart + i + 1;
        
        // 進捗表示（10件ごと）
        if (globalIndex % 10 === 0) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const rate = progress.successCount / (elapsed / 60) || 0;
          console.log(`\n📊 全体進捗: ${globalIndex}/${articlesToProcess.length} (${Math.round(globalIndex/articlesToProcess.length*100)}%)`);
          console.log(`✅ 成功: ${progress.successCount}, ⏭️ スキップ: ${progress.skipCount}, ❌ エラー: ${progress.errorCount}`);
          console.log(`⏱️ 経過: ${Math.floor(elapsed/60)}分${elapsed%60}秒`);
          console.log(`🚀 処理速度: ${rate.toFixed(1)}件/分\n`);
        }
        
        console.log(`[${globalIndex}/${articlesToProcess.length}] ${article.id}`);
        
        try {
          // 特定の短い要約はスキップ（技術用語のみなど適切なもの）
          if (article.summary && shouldSkipSummary(article.summary, article.title || '')) {
            console.log(`  ⏭️ スキップ: 適切な短い要約`);
            progress.skipCount++;
            progress.processedIds.push(article.id);
            results.push({
              id: article.id,
              status: 'skipped',
              reason: '適切な短い要約'
            });
            continue;
          }
          
          // コンテンツを準備
          let sourceContent = article.content || '';
          
          if (!sourceContent && article.detailedSummary) {
            sourceContent = `タイトル: ${article.title}\n\n詳細内容:\n${article.detailedSummary}`;
          } else if (!sourceContent) {
            sourceContent = article.title || '';
          }
          
          // プロンプトを作成
          const prompt = `
以下の記事の要約を80〜120文字で作成してください。
技術的な内容と主要なポイントを含め、具体的に記述してください。

タイトル: ${article.title}
内容: ${sourceContent.substring(0, 2000)}

要約（80〜120文字）:`;
          
          const model = geminiClient.model;
          const result = await model.generateContent(prompt);
          let newSummary = result.response.text().trim()
            .replace(/^要約[:：]\s*/i, '')
            .replace(/^\*\*/g, '')
            .replace(/\*\*$/g, '')
            .trim();
          
          // 品質チェック
          if (!newSummary || newSummary.length < 70 || newSummary.length > 150) {
            throw new Error(`要約の長さが不適切: ${newSummary?.length || 0}文字`);
          }
          
          // 日本語チェック
          const japaneseChars = (newSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
          const japaneseRatio = japaneseChars / newSummary.length;
          
          if (japaneseRatio < 0.3) {
            throw new Error(`日本語が少なすぎます: ${(japaneseRatio * 100).toFixed(1)}%`);
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
          
          progress.successCount++;
          progress.processedIds.push(article.id);
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
          console.log(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
          progress.errorCount++;
          progress.processedIds.push(article.id);
          results.push({
            id: article.id,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
          });
        }
        
        // 進捗を保存（5件ごと）
        if (globalIndex % 5 === 0) {
          progress.lastProcessedAt = new Date().toISOString();
          saveProgress(progress);
        }
        
        // API制限対策
        if (i < batchArticles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, API_DELAY));
        }
      }
      
      // バッチ終了時に進捗保存
      progress.lastProcessedAt = new Date().toISOString();
      saveProgress(progress);
      
      // バッチ間の休憩（5秒）
      if (batchNum < totalBatches - 1) {
        console.log(`\n⏸️ 次のバッチまで5秒待機...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // 最終結果
    const endTime = Date.now();
    const totalTime = Math.floor((endTime - startTime) / 1000);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 最終処理結果\n');
    console.log(`✅ 成功: ${progress.successCount}件`);
    console.log(`⏭️ スキップ: ${progress.skipCount}件`);
    console.log(`❌ エラー: ${progress.errorCount}件`);
    console.log(`📈 成功率: ${((progress.successCount / articlesToProcess.length) * 100).toFixed(1)}%`);
    console.log(`⏱️ 総処理時間: ${Math.floor(totalTime/60)}分${totalTime%60}秒`);
    console.log(`🚀 平均処理速度: ${(articlesToProcess.length / (totalTime / 60)).toFixed(1)}件/分`);
    
    // 成功した結果の統計
    const successfulResults = results.filter(r => r.status === 'success');
    if (successfulResults.length > 0) {
      const avgOldLength = successfulResults.reduce((sum, r) => sum + (r.oldLength || 0), 0) / successfulResults.length;
      const avgNewLength = successfulResults.reduce((sum, r) => sum + r.newLength, 0) / successfulResults.length;
      console.log(`\n📏 平均文字数の変化:`);
      console.log(`  変更前: ${avgOldLength.toFixed(1)}文字`);
      console.log(`  変更後: ${avgNewLength.toFixed(1)}文字`);
      console.log(`  改善率: ${((avgNewLength / avgOldLength - 1) * 100).toFixed(1)}%`);
    }
    
    // 結果をファイルに保存
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultFile = `fix-all-short-summaries-result-${timestamp}.json`;
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalProcessed: articlesToProcess.length,
      successCount: progress.successCount,
      errorCount: progress.errorCount,
      skipCount: progress.skipCount,
      totalTime: totalTime,
      results: results
    }, null, 2));
    
    console.log(`\n📁 詳細な結果を ${resultFile} に保存しました`);
    
    // 進捗ファイルを削除（完了時）
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      console.log('✅ 進捗ファイルを削除しました');
    }
    
  } catch (error) {
    console.error('致命的エラー:', error);
    // エラー時も進捗を保存
    progress.lastProcessedAt = new Date().toISOString();
    saveProgress(progress);
    console.log('\n⚠️ 進捗を保存しました。再実行で続きから処理できます。');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// スキップすべき要約かどうか判定
function shouldSkipSummary(summary: string, title: string): boolean {
  // 50-80文字で、内容が適切そうなもの
  if (summary.length >= 50 && summary.length < 80) {
    // 技術用語や製品名が中心の場合は適切
    const techTerms = ['API', 'AWS', 'Docker', 'Kubernetes', 'React', 'Vue', 'TypeScript', 'JavaScript', 'Python'];
    const hasTechTerms = techTerms.some(term => summary.includes(term) || title.includes(term));
    
    // 句点で終わっていて、技術用語を含む場合はスキップ
    if (summary.endsWith('。') && hasTechTerms) {
      return true;
    }
    
    // バージョン情報やリリース情報の場合
    if (summary.match(/v\d+\.\d+/) || summary.includes('リリース') || summary.includes('公開')) {
      return true;
    }
  }
  
  return false;
}

// Ctrl+C などでの中断時に進捗を保存
process.on('SIGINT', () => {
  console.log('\n\n⚠️ 処理を中断しています...');
  const progress = loadProgress();
  progress.lastProcessedAt = new Date().toISOString();
  saveProgress(progress);
  console.log('✅ 進捗を保存しました。再実行で続きから処理できます。');
  process.exit(0);
});

// メイン実行
fixAllShortSummaries().catch(console.error);