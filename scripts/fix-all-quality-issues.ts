#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function fixAllQualityIssues() {
  console.log('🔧 すべての品質問題を修正\n');
  
  try {
    // 問題のある記事IDを読み込み
    const problemData = JSON.parse(fs.readFileSync('problem-articles.json', 'utf-8'));
    const allProblemIds = problemData.problemIds;
    
    console.log(`修正対象: ${allProblemIds.length}件\n`);
    
    // 優先度順にソート（重要な問題から修正）
    const prioritizedIds = [];
    
    // 優先度1: 要約なし・詳細要約なし
    const criticalIds = [
      ...problemData.details.summaryMissing,
      ...problemData.details.detailedMissing
    ];
    
    // 優先度2: 英語要約
    const englishIds = [
      ...problemData.details.summaryEnglish,
      ...problemData.details.detailedEnglish
    ];
    
    // 優先度3: 技術的背景なし
    const technicalBgIds = problemData.details.detailedNoTechnicalBg;
    
    // 優先度4: プレフィックス・Markdown
    const formatIds = [
      ...problemData.details.summaryPrefix,
      ...problemData.details.summaryMarkdown,
      ...problemData.details.detailedMarkdown
    ];
    
    // 重複を除去して優先度順に並べる
    const processedIds = new Set();
    
    [...criticalIds, ...englishIds, ...technicalBgIds, ...formatIds].forEach(id => {
      if (!processedIds.has(id)) {
        prioritizedIds.push(id);
        processedIds.add(id);
      }
    });
    
    console.log(`優先度付け完了: ${prioritizedIds.length}件を処理\n`);
    
    // ローカルLLMクライアントを初期化
    const localLLM = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: 3000,
      temperature: 0.3,
      maxContentLength: 12000
    });
    
    // 接続確認
    const connected = await localLLM.testConnection();
    if (!connected) {
      console.error('❌ ローカルLLMサーバーに接続できません');
      return;
    }
    console.log('✅ ローカルLLMサーバー接続成功\n');
    
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;
    const startTime = Date.now();
    
    // バッチサイズを30に制限
    const batchSize = 30;
    const batches = Math.ceil(prioritizedIds.length / batchSize);
    
    for (let batch = 0; batch < batches; batch++) {
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, prioritizedIds.length);
      const batchIds = prioritizedIds.slice(batchStart, batchEnd);
      
      console.log(`\n📦 バッチ ${batch + 1}/${batches} (${batchIds.length}件)\n`);
      
      for (let i = 0; i < batchIds.length; i++) {
        const articleId = batchIds[i];
        const globalIndex = batchStart + i + 1;
        
        // 進捗表示
        if (globalIndex % 10 === 0) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const rate = successCount / (elapsed / 60) || 0;
          console.log(`\n📊 進捗: ${globalIndex}/${prioritizedIds.length} (${Math.round(globalIndex/prioritizedIds.length*100)}%)`);
          console.log(`✅ 成功: ${successCount}, ⏭️ スキップ: ${skipCount}, ❌ エラー: ${errorCount}`);
          console.log(`⏱️ 経過: ${Math.floor(elapsed/60)}分${elapsed%60}秒`);
          console.log(`🚀 速度: ${rate.toFixed(1)}件/分\n`);
        }
        
        console.log(`[${globalIndex}/${prioritizedIds.length}] 処理中: ${articleId}`);
        
        try {
          // 記事を取得
          const article = await prisma.article.findUnique({
            where: { id: articleId },
            select: {
              id: true,
              title: true,
              content: true,
              url: true,
              summary: true,
              detailedSummary: true,
              source: { select: { name: true } }
            }
          });
          
          if (!article) {
            console.log('  ❌ 記事が見つかりません');
            errorCount++;
            continue;
          }
          
          console.log(`  📝 ${article.title?.substring(0, 50)}...`);
          
          // 問題を特定
          const issues = [];
          let needsRegeneration = false;
          
          // 一覧要約の問題チェック
          if (!article.summary || article.summary.trim() === '') {
            issues.push('要約なし');
            needsRegeneration = true;
          } else {
            const summary = article.summary.trim();
            
            // プレフィックスチェック
            if (summary.match(/^\s*要約[:：]/i) || 
                summary.match(/^\s*\*\*要約/i) ||
                summary.match(/^##/)) {
              issues.push('プレフィックス');
              needsRegeneration = true;
            }
            
            // Markdown記法
            if (summary.includes('**') || summary.includes('##')) {
              issues.push('Markdown');
              needsRegeneration = true;
            }
            
            // 英語チェック
            const japaneseChars = (summary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
            if (summary.length > 10 && japaneseChars / summary.length < 0.3) {
              issues.push('英語要約');
              needsRegeneration = true;
            }
          }
          
          // 詳細要約の問題チェック
          if (!article.detailedSummary || article.detailedSummary.trim() === '') {
            issues.push('詳細要約なし');
            needsRegeneration = true;
          } else {
            const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
            
            if (lines.length < 6) {
              issues.push('項目不足');
              needsRegeneration = true;
            }
            
            if (lines.length > 0 && !lines[0].includes('記事の主題は')) {
              issues.push('技術的背景なし');
              needsRegeneration = true;
            }
            
            // Markdown記法
            if (article.detailedSummary.includes('**') || 
                article.detailedSummary.includes('##')) {
              issues.push('詳細Markdown');
              needsRegeneration = true;
            }
          }
          
          if (!needsRegeneration) {
            console.log('  ⏭️ 修正不要');
            skipCount++;
            continue;
          }
          
          console.log(`  ⚠️ 問題: ${issues.join(', ')}`);
          
          // コンテンツを準備
          let content = article.content || '';
          if (content.length < 100) {
            let additionalContext = '';
            
            if (article.source?.name === 'はてなブックマーク') {
              additionalContext = `
この記事は日本の技術コミュニティで話題になった記事です。
技術トレンド、開発手法、ツール、プログラミング言語、フレームワーク等が主なトピックです。
要約は必ず日本語で、技術的な内容を含めて生成してください。`;
            } else if (article.source?.name === 'Zenn') {
              additionalContext = `
この記事はZennの技術記事で、実践的な開発ノウハウやTipsが共有されています。
具体的なコード例、設定方法、トラブルシューティングなどが含まれます。
要約は必ず日本語で、実用的な情報を含めて生成してください。`;
            } else if (article.source?.name === 'Dev.to') {
              additionalContext = `
This is a technical article from Dev.to discussing software development.
Topics include programming languages, frameworks, tools, and best practices.
要約は必ず日本語で生成し、技術用語は適切に翻訳してください。`;
            } else if (article.source?.name === 'Qiita' || article.source?.name === 'Qiita Popular') {
              additionalContext = `
この記事はQiitaの技術記事で、日本のエンジニアによる実践的な知識共有です。
実装方法、問題解決のアプローチ、ベストプラクティスなどが含まれます。
要約は必ず日本語で、具体的な技術内容を含めて生成してください。`;
            } else {
              additionalContext = `
この記事は技術系の情報源からの記事です。
最新の技術動向、開発手法、ツール、サービスなどについて扱っています。
要約は必ず日本語で、技術的な内容を正確に含めて生成してください。`;
            }
            
            content = `
Title: ${article.title || 'タイトル不明'}
URL: ${article.url || ''}
Source: ${article.source?.name || '不明'}

Article Content:
${article.content || 'コンテンツが利用できません。タイトルとURLから内容を推測してください。'}

Context:
${additionalContext}

重要な指示:
1. 一覧要約は必ず日本語で60-120文字程度、技術的な内容を含める
2. 詳細要約は必ず6項目以上、第1項目は「記事の主題は」で始める
3. 不明な場合でも、タイトルとソースから推測して有益な要約を生成
4. プレフィックス（「要約:」など）やMarkdown記法（**、##など）は絶対に使用しない
5. 技術用語は適切に日本語化または説明を加える
            `.trim();
          }
          
          console.log('  🔄 要約を再生成中...');
          
          const result = await localLLM.generateDetailedSummary(
            article.title || '',
            content
          );
          
          // 要約を徹底的にクリーンアップ
          let cleanedSummary = result.summary
            .replace(/^\s*要約[:：]\s*/gi, '')
            .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
            .replace(/^\s*##\s*/g, '')
            .replace(/\*\*/g, '')
            .replace(/##\s*/g, '')
            .replace(/```/g, '')
            .replace(/`/g, '')
            .trim();
          
          // 詳細要約もクリーンアップ
          let cleanedDetailedSummary = result.detailedSummary
            .replace(/\*\*/g, '')
            .replace(/##\s*/g, '')
            .replace(/```/g, '')
            .trim();
          
          // 品質チェック
          const japaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
          const totalChars = cleanedSummary.length;
          const isJapanese = totalChars > 0 && japaneseChars / totalChars > 0.3;
          const hasContent = cleanedSummary.length >= 20 && cleanedSummary.length <= 150;
          
          // 詳細要約の確認
          const newLines = cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
          const hasProperTechnicalBackground = newLines.length > 0 && newLines[0].includes('記事の主題は');
          const hasEnoughItems = newLines.length >= 6;
          
          if (isJapanese && hasContent && hasProperTechnicalBackground && hasEnoughItems) {
            // タグを準備
            const tagConnections = await Promise.all(
              result.tags.map(async (tagName) => {
                const tag = await prisma.tag.upsert({
                  where: { name: tagName },
                  update: {},
                  create: { 
                    name: tagName, 
                    category: null 
                  }
                });
                return { id: tag.id };
              })
            );
            
            // データベースを更新
            await prisma.article.update({
              where: { id: articleId },
              data: {
                summary: cleanedSummary,
                detailedSummary: cleanedDetailedSummary,
                tags: { set: tagConnections },
                updatedAt: new Date()
              }
            });
            
            console.log('  ✅ 修正成功');
            successCount++;
          } else {
            const problems = [];
            if (!isJapanese) problems.push('日本語化失敗');
            if (!hasContent) problems.push('内容不適切');
            if (!hasProperTechnicalBackground) problems.push('技術的背景なし');
            if (!hasEnoughItems) problems.push('項目数不足');
            console.log(`  ⚠️ 品質チェック失敗: ${problems.join(', ')}`);
            errorCount++;
          }
          
        } catch (error: any) {
          console.error(`  ❌ エラー: ${error.message || error}`);
          errorCount++;
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      // バッチ完了後、最初のバッチのみ処理する（テスト的に）
      if (batch === 0) {
        console.log('\n最初のバッチ（30件）の処理が完了しました。');
        break;
      }
    }
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.log('\n' + '='.repeat(60));
    console.log('🎉 処理完了');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`⏭️ スキップ: ${skipCount}件`);
    console.log(`❌ エラー: ${errorCount}件`);
    console.log(`⏱️ 総処理時間: ${Math.floor(totalTime/60)}分${totalTime%60}秒`);
    console.log(`🚀 平均処理速度: ${(successCount / (totalTime / 60)).toFixed(1)}件/分`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllQualityIssues().catch(console.error);