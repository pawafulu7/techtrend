#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixTechnicalBackgroundBatch() {
  // 次の30件の記事ID（第4バッチ）
  const articleIds = [
    "cmdy0hcvs0002teue0kjaclad",
    "cmdy0hcoi0009teuepxtvdvio",
    "cmdy0hcnp0007teueaezr863s",
    "cmdxyc8yj000bteoygjb03d0e",
    "cmdxyc8xd0009teoyi7fdajpg",
    "cmdxyc8wc0007teoyqufceyg3",
    "cmdxybplx0005teoykxxeqhbv",
    "cmdxw71lt0009tedljmqphhfe",
    "cmdxw71l10007tedlxdphm984",
    "cmdxw71k40005tedlvnt99aiw",
    "cmdxw6ekz0003tedlvmnbkuoo",
    "cmdxu1uf5000cte8eaqo6sauz",
    "cmdxu1udp000ate8e5f0xbvvk",
    "cmdxu1sxo0008te8ej9vawum8",
    "cmdxu1swz0005te8e2f8l3teg",
    "cmdxu1swa0002te8ele9976ss",
    "cmdxrwpq80009telqve48zwg9",
    "cmdxrwpp80007telq4cl3720d",
    "cmdxrwpnq0005telqsqzykz1v",
    "cmdxrwplv0003telqzbowu0r1",
    "cmdxrwpkt0001telqjan8y4x6",
    "cmdxprmjz0030tezpogjatbcz",
    "cmdxprmj1002ytezpj0rv5k5j",
    "cmdxprmi5002wtezpsl0a72qv",
    "cmdxprmh7002utezpokwiqdg8",
    "cmdxprmgc002stezpuakd0y4x",
    "cmdxprmfe002qtezpnmiqvq6x",
    "cmdxprmee002otezpcdo0f2jg",
    "cmdxprkzv002mtezp41tqz4mu",
    "cmdxprkz0002jtezpw34s2jim"
  ];
  
  console.log('🔧 技術的背景を含む詳細要約を再生成（バッチ処理）\n');
  console.log(`処理対象: ${articleIds.length}件\n`);
  
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
    console.log('✅ ローカルLLMサーバー接続成功\n');
    
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i];
      console.log(`\n[${i + 1}/${articleIds.length}] 処理中: ${articleId}`);
      console.log('='.repeat(60));
      
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
          console.log('❌ 記事が見つかりません');
          errorCount++;
          continue;
        }
        
        console.log(`タイトル: ${article.title?.substring(0, 50)}...`);
        console.log(`ソース: ${article.source?.name}`);
        
        // 現在の詳細要約の確認
        if (article.detailedSummary) {
          const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
          if (lines.length > 0) {
            const firstLine = lines[0];
            console.log(`現在の第1項目: ${firstLine.substring(0, 50)}...`);
            
            // すでに「記事の主題は」で始まっている場合はスキップ
            if (firstLine.includes('記事の主題は')) {
              console.log('✅ すでに技術的背景が含まれています');
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
最新の技術トレンド、開発手法、ツール、プログラミング言語、フレームワーク等について議論されています。`;
          } else if (article.source?.name === 'Zenn') {
            additionalContext = `
この記事はZennの技術記事で、実践的な開発ノウハウやTipsが共有されています。
具体的なコード例、設定方法、トラブルシューティングなどが含まれる可能性があります。`;
          } else if (article.source?.name === 'Dev.to') {
            additionalContext = `
This is a technical article from Dev.to platform discussing modern software development practices.
Topics may include programming languages, frameworks, tools, methodologies, and best practices.`;
          } else if (article.source?.name === 'Speaker Deck') {
            additionalContext = `
これは技術カンファレンスやミートアップで発表されたプレゼンテーション資料です。
技術的な概念、アーキテクチャ、実装パターン、ケーススタディなどが含まれます。`;
          } else if (article.source?.name === 'Qiita') {
            additionalContext = `
この記事はQiitaの技術記事で、日本のエンジニアによる実践的な知識共有です。
具体的な実装方法、問題解決のアプローチ、ベストプラクティスなどが含まれます。`;
          }
          
          content = `
Title: ${article.title}
URL: ${article.url}
Source: ${article.source?.name}

Article Content:
${article.content || ''}

Context:
${additionalContext}
          `.trim();
        }
        
        console.log(`コンテンツ長: ${content.length}文字`);
        
        console.log('🔄 技術的背景を含む詳細要約を生成中...');
        const startTime = Date.now();
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          content
        );
        
        const duration = Date.now() - startTime;
        console.log(`生成時間: ${duration}ms`);
        
        // 要約をクリーンアップ
        let cleanedSummary = result.summary
          .replace(/^\\s*要約[:：]\\s*/gi, '')
          .replace(/\\*\\*/g, '')
          .trim();
        
        // 詳細要約の確認
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (newLines.length > 0) {
          const firstLine = newLines[0];
          console.log(`新しい第1項目: ${firstLine.substring(0, 50)}...`);
          
          // 「記事の主題は」で始まっているか確認
          if (firstLine.includes('記事の主題は')) {
            console.log('✅ 技術的背景を含む詳細要約を生成成功');
            
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
            
            successCount++;
          } else {
            console.log('⚠️ 技術的背景が生成されませんでした');
            errorCount++;
          }
        } else {
          console.log('⚠️ 詳細要約の生成に失敗');
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('処理完了');
    console.log(`成功: ${successCount}件`);
    console.log(`スキップ: ${skipCount}件`);
    console.log(`エラー: ${errorCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixTechnicalBackgroundBatch().catch(console.error);