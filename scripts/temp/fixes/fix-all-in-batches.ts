#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../../lib/ai/local-llm';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function fixAllInBatches() {
  console.error('🔧 全記事の品質問題を50件ずつバッチ処理\n');
  
  try {
    // 問題のある記事IDを読み込み
    const problemData = JSON.parse(fs.readFileSync('problem-articles.json', 'utf-8'));
    const allProblemIds = problemData.problemIds;
    
    // 既に処理済みの記事IDを除外（前回30件処理済み）
    const processedIds = new Set([
      'cmdtshkpz000fte82hax8h1jk',
      'cmdtm6qfy003ote4dfwyhin3k',
      'cme2asfhm0005te8548b5dwdt',
      'cme0tam2m00aqtevwrfcjj4mi',
      'cmdy6wuir0003temnyia03kid',
      'cmds251f3005dteo6qg2yxfqz',
      'cmdwgzoex000jtealzexcdz25',
      'cmdu8emoq0005te8d0c8hl4la',
      'cmdqm0w0x000stel7i0wm0ckw',
      'cmdq44l10001rte3t5ey2xx36',
      'cmdq44krw000hte3tvpns7t0d',
      'cmdq44kpg0007te3t84e39grw',
      'cmdq44jco0035te3tsbtjun7w',
      'cmdq44jan002xte3t1qnewh09',
      'cmdq44ja9002vte3tcmevpe92',
      'cmdq44j8i002nte3tltkufinm',
      'cmdq44j7l002jte3tropiuvks',
      'cmdq44j5x002dte3ta0j893ic',
      'cmdq44j5d002bte3tpd5tskud',
      'cmdq44j4i0027te3tz2pe015h',
      'cmdq44j360021te3tzep8bbul'
    ]);
    
    const remainingIds = allProblemIds.filter(id => !processedIds.has(id));
    
    console.error(`全問題記事数: ${allProblemIds.length}件`);
    console.error(`処理済み: ${processedIds.size}件`);
    console.error(`残り処理対象: ${remainingIds.length}件\n`);
    
    // 50件ずつ処理
    const batchSize = 50;
    const startIndex = parseInt(process.argv[2] || '0');
    const endIndex = Math.min(startIndex + batchSize, remainingIds.length);
    const batchIds = remainingIds.slice(startIndex, endIndex);
    
    console.error(`このバッチ: ${startIndex + 1}-${endIndex}件目 (${batchIds.length}件)\n`);
    
    if (batchIds.length === 0) {
      console.error('処理する記事がありません');
      return;
    }
    
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
    console.error('✅ ローカルLLMサーバー接続成功\n');
    
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < batchIds.length; i++) {
      const articleId = batchIds[i];
      console.error(`[${i + 1}/${batchIds.length}] 処理中: ${articleId}`);
      
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
          console.error('  ❌ 記事が見つかりません');
          errorCount++;
          continue;
        }
        
        // 問題を特定
        const issues = [];
        let needsRegeneration = false;
        
        // プレフィックスのクリーンアップのみ（再生成不要）
        let cleanedSummary = article.summary || '';
        let cleanedDetailedSummary = article.detailedSummary || '';
        let simpleCleanupOnly = false;
        
        if (cleanedSummary) {
          const originalSummary = cleanedSummary;
          // プレフィックスとMarkdownを除去
          cleanedSummary = cleanedSummary
            .replace(/^\s*要約[:：]\s*/gi, '')
            .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
            .replace(/^\s*##\s*/g, '')
            .replace(/\*\*/g, '')
            .replace(/##\s*/g, '')
            .replace(/```/g, '')
            .replace(/`/g, '')
            .trim();
          
          if (originalSummary !== cleanedSummary) {
            issues.push('プレフィックス/Markdown除去');
            simpleCleanupOnly = true;
          }
        }
        
        if (cleanedDetailedSummary) {
          const originalDetailed = cleanedDetailedSummary;
          cleanedDetailedSummary = cleanedDetailedSummary
            .replace(/\*\*/g, '')
            .replace(/##\s*/g, '')
            .replace(/```/g, '')
            .trim();
          
          if (originalDetailed !== cleanedDetailedSummary) {
            issues.push('詳細Markdown除去');
            simpleCleanupOnly = true;
          }
        }
        
        // より深刻な問題をチェック
        if (!simpleCleanupOnly) {
          // 要約なし
          if (!cleanedSummary || cleanedSummary.trim() === '') {
            issues.push('要約なし');
            needsRegeneration = true;
          } else {
            // 英語チェック
            const japaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
            if (cleanedSummary.length > 10 && japaneseChars / cleanedSummary.length < 0.3) {
              issues.push('英語要約');
              needsRegeneration = true;
            }
          }
          
          // 詳細要約の問題
          if (!cleanedDetailedSummary || cleanedDetailedSummary.trim() === '') {
            issues.push('詳細要約なし');
            needsRegeneration = true;
          } else {
            const lines = cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
            
            if (lines.length < 6) {
              issues.push('項目不足');
              needsRegeneration = true;
            }
            
            if (lines.length > 0 && !lines[0].includes('記事の主題は')) {
              issues.push('技術的背景なし');
              needsRegeneration = true;
            }
          }
        }
        
        if (issues.length === 0) {
          console.error('  ⏭️ 修正不要');
          skipCount++;
          continue;
        }
        
        console.error(`  ⚠️ 問題: ${issues.join(', ')}`);
        
        if (simpleCleanupOnly && !needsRegeneration) {
          // 単純なクリーンアップのみ
          await prisma.article.update({
            where: { id: articleId },
            data: {
              summary: cleanedSummary,
              detailedSummary: cleanedDetailedSummary,
              updatedAt: new Date()
            }
          });
          
          console.error('  ✅ クリーンアップ成功');
          successCount++;
        } else {
          // 再生成が必要
          console.error('  🔄 要約を再生成中...');
          
          // コンテンツを準備
          let content = article.content || '';
          if (content.length < 100) {
            let additionalContext = '';
            
            if (article.source?.name?.includes('はてな')) {
              additionalContext = '日本の技術コミュニティで話題の記事。要約は必ず日本語で生成。';
            } else if (article.source?.name === 'Zenn') {
              additionalContext = 'Zennの技術記事。実践的な開発ノウハウやTips。要約は必ず日本語で生成。';
            } else if (article.source?.name === 'Dev.to') {
              additionalContext = 'Dev.toの技術記事。要約は必ず日本語で生成し、技術用語は適切に翻訳。';
            } else if (article.source?.name?.includes('Qiita')) {
              additionalContext = 'Qiitaの技術記事。日本のエンジニアによる知識共有。要約は必ず日本語で生成。';
            } else {
              additionalContext = '技術記事。要約は必ず日本語で生成。';
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
1. 一覧要約は必ず日本語で60-120文字程度
2. 詳細要約は必ず6項目以上、第1項目は「記事の主題は」で始める
3. プレフィックスやMarkdown記法は絶対に使用しない
            `.trim();
          }
          
          const result = await localLLM.generateDetailedSummary(
            article.title || '',
            content
          );
          
          // 徹底的にクリーンアップ
          cleanedSummary = result.summary
            .replace(/^\s*要約[:：]\s*/gi, '')
            .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
            .replace(/^\s*##\s*/g, '')
            .replace(/\*\*/g, '')
            .replace(/##\s*/g, '')
            .replace(/```/g, '')
            .replace(/`/g, '')
            .trim();
          
          cleanedDetailedSummary = result.detailedSummary
            .replace(/\*\*/g, '')
            .replace(/##\s*/g, '')
            .replace(/```/g, '')
            .trim();
          
          // 品質チェック
          const japaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
          const isJapanese = cleanedSummary.length > 0 && japaneseChars / cleanedSummary.length > 0.3;
          const hasContent = cleanedSummary.length >= 20 && cleanedSummary.length <= 150;
          
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
            
            await prisma.article.update({
              where: { id: articleId },
              data: {
                summary: cleanedSummary,
                detailedSummary: cleanedDetailedSummary,
                tags: { set: tagConnections },
                updatedAt: new Date()
              }
            });
            
            console.error('  ✅ 再生成成功');
            successCount++;
          } else {
            const problems = [];
            if (!isJapanese) problems.push('日本語化失敗');
            if (!hasContent) problems.push('内容不適切');
            if (!hasProperTechnicalBackground) problems.push('技術的背景なし');
            if (!hasEnoughItems) problems.push('項目数不足');
            console.error(`  ⚠️ 品質チェック失敗: ${problems.join(', ')}`);
            errorCount++;
          }
        }
        
      } catch (error: any) {
        console.error(`  ❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.error('\n' + '='.repeat(60));
    console.error(`🎉 バッチ処理完了 (${startIndex + 1}-${endIndex}件目)`);
    console.error(`✅ 成功: ${successCount}件`);
    console.error(`⏭️ スキップ: ${skipCount}件`);
    console.error(`❌ エラー: ${errorCount}件`);
    console.error(`⏱️ 処理時間: ${Math.floor(totalTime/60)}分${totalTime%60}秒`);
    console.error(`🚀 処理速度: ${(successCount / (totalTime / 60)).toFixed(1)}件/分`);
    
    if (endIndex < remainingIds.length) {
      console.error(`\n📌 次のバッチ: npx tsx scripts/fix-all-in-batches.ts ${endIndex}`);
    } else {
      console.error('\n✨ すべてのバッチ処理が完了しました！');
    }
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllInBatches().catch(console.error);