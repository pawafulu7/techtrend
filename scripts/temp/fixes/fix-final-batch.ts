#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixFinalBatch() {
  // 最終バッチ - 残り14件
  const articleIds = [
    "cme26i7b2003ote8rnv8lgcrj",
    "cme26i6tb0032te8r9q9kidw1",
    "cme26i251001ste8rsdkmy2h2",
    "cmdwgzoex000jtealzexcdz25",
    "cmdwgqm4t0005tehuz9sdhyvw",
    "cmdv7qpk40008teqxfl803rz0",
    "cmdu8emoq0005te8d0c8hl4la",
    "cmds6eyeh000bteojhu45cykk",
    "cmds24iqe003oteo68k8427e3",
    "cmdqm0w0x000stel7i0wm0ckw",
    "cmdq4ou3h0015terlm23bkqi7",
    "cmdq4otwo000hterleohjv4hp",
    "cmdq4otvd000bterl6qxdzli6",
    "cmdq44z94005zte3tw2v0nnj7"
  ];
  
  console.error('🔧 最終バッチ - 技術的背景を含む詳細要約を再生成\n');
  console.error(`処理対象: ${articleIds.length}件\n`);
  
  try {
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
    
    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i];
      console.error(`\n[${i + 1}/${articleIds.length}] 処理中: ${articleId}`);
      console.error('='.repeat(60));
      
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
          console.error('❌ 記事が見つかりません');
          errorCount++;
          continue;
        }
        
        console.error(`タイトル: ${article.title?.substring(0, 50)}...`);
        console.error(`ソース: ${article.source?.name}`);
        
        // 現在の詳細要約の確認
        if (article.detailedSummary) {
          const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
          if (lines.length > 0) {
            const firstLine = lines[0];
            console.error(`現在の第1項目: ${firstLine.substring(0, 50)}...`);
            
            // すでに「記事の主題は」で始まっている場合はスキップ
            if (firstLine.includes('記事の主題は')) {
              console.error('✅ すでに技術的背景が含まれています');
              skipCount++;
              continue;
            }
          }
        }
        
        // コンテンツを準備
        let content = article.content || '';
        if (content.length < 300) {
          // ソースごとに適切なコンテキストを追加
          let additionalContext = '';
          
          if (article.source?.name === 'はてなブックマーク') {
            additionalContext = `
この記事は日本の技術コミュニティで話題になった記事です。
最新の技術トレンド、開発手法、ツール、プログラミング言語、フレームワーク等について議論されています。
要約は必ず日本語で生成してください。`;
          } else if (article.source?.name === 'Zenn') {
            additionalContext = `
この記事はZennの技術記事で、実践的な開発ノウハウやTipsが共有されています。
具体的なコード例、設定方法、トラブルシューティングなどが含まれる可能性があります。
要約は必ず日本語で生成してください。`;
          } else if (article.source?.name === 'Dev.to') {
            additionalContext = `
This is a technical article from Dev.to platform discussing modern software development practices.
Topics may include programming languages, frameworks, tools, methodologies, and best practices.
要約は必ず日本語で生成してください。英語の技術用語は適切に日本語に翻訳してください。`;
          } else if (article.source?.name === 'Speaker Deck') {
            additionalContext = `
これは技術カンファレンスやミートアップで発表されたプレゼンテーション資料です。
技術的な概念、アーキテクチャ、実装パターン、ケーススタディなどが含まれます。
要約は必ず日本語で生成してください。`;
          } else if (article.source?.name === 'Qiita') {
            additionalContext = `
この記事はQiitaの技術記事で、日本のエンジニアによる実践的な知識共有です。
具体的な実装方法、問題解決のアプローチ、ベストプラクティスなどが含まれます。
要約は必ず日本語で生成してください。`;
          } else if (article.source?.name === 'AWS') {
            additionalContext = `
これはAWSの公式発表やアップデート情報です。
新機能、サービス改善、技術仕様の変更などが含まれます。
要約は必ず日本語で生成してください。AWSサービス名は英語のまま残してください。`;
          } else {
            additionalContext = `
この記事は技術系の情報源からの記事です。
最新の技術動向、開発手法、ツール、サービスなどについて扱っています。
要約は必ず日本語で生成してください。`;
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
4. プレフィックスやMarkdown記法は使用しない
5. 技術用語は適切に日本語化または説明を加える
          `.trim();
        }
        
        console.error(`コンテンツ長: ${content.length}文字`);
        
        console.error('🔄 技術的背景を含む詳細要約を生成中...');
        const genStartTime = Date.now();
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          content
        );
        
        const duration = Date.now() - genStartTime;
        console.error(`生成時間: ${duration}ms`);
        
        // 要約をクリーンアップ
        const cleanedSummary = result.summary
          .replace(/^\s*要約[:：]\s*/gi, '')
          .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
          .replace(/\*\*/g, '')
          .replace(/##\s*/g, '')
          .replace(/```/g, '')
          .trim();
        
        // 品質チェック
        const japaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const totalChars = cleanedSummary.length;
        const isJapanese = totalChars > 0 && japaneseChars / totalChars > 0.3;
        const hasContent = cleanedSummary.length >= 20;
        
        // 詳細要約の確認
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        const hasProperTechnicalBackground = newLines.length > 0 && newLines[0].includes('記事の主題は');
        const hasEnoughItems = newLines.length >= 6;
        
        if (newLines.length > 0) {
          console.error(`新しい第1項目: ${newLines[0].substring(0, 50)}...`);
        }
        
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
              detailedSummary: result.detailedSummary,
              tags: { set: tagConnections },
              updatedAt: new Date()
            }
          });
          
          console.error('✅ 修正成功');
          successCount++;
        } else {
          const problems = [];
          if (!isJapanese) problems.push('日本語化失敗');
          if (!hasContent) problems.push('内容不足');
          if (!hasProperTechnicalBackground) problems.push('技術的背景なし');
          if (!hasEnoughItems) problems.push('項目数不足');
          console.error(`⚠️ 品質チェック失敗: ${problems.join(', ')}`);
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.error('\n' + '='.repeat(60));
    console.error('🎉 最終バッチ処理完了');
    console.error(`✅ 成功: ${successCount}件`);
    console.error(`⏭️ スキップ: ${skipCount}件`);
    console.error(`❌ エラー: ${errorCount}件`);
    console.error(`⏱️ 総処理時間: ${Math.floor(totalTime/60)}分${totalTime%60}秒`);
    console.error(`🚀 平均処理速度: ${(successCount / (totalTime / 60)).toFixed(1)}件/分`);
    
    // 全体の修正結果を確認
    console.error('\n' + '='.repeat(60));
    console.error('📊 全体の修正完了状況を確認中...');
    
    const allArticles = await prisma.article.findMany({
      where: {
        detailedSummary: { not: null }
      },
      select: {
        id: true,
        detailedSummary: true
      }
    });
    
    let technicalBackgroundCount = 0;
    let missingBackgroundCount = 0;
    
    for (const article of allArticles) {
      if (article.detailedSummary) {
        const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (lines.length > 0) {
          if (lines[0].includes('記事の主題は')) {
            technicalBackgroundCount++;
          } else {
            missingBackgroundCount++;
          }
        }
      }
    }
    
    console.error(`\n🎊 全体統計:`);
    console.error(`✅ 技術的背景あり: ${technicalBackgroundCount}件`);
    console.error(`❌ 技術的背景なし: ${missingBackgroundCount}件`);
    console.error(`📈 完了率: ${((technicalBackgroundCount / (technicalBackgroundCount + missingBackgroundCount)) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixFinalBatch().catch(console.error);