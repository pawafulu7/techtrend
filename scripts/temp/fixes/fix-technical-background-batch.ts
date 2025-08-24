#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixTechnicalBackgroundBatch() {
  // 次の30件の記事ID（第5バッチ）
  const articleIds = [
    "cmdxprmh7002utezpokwiqdg8",
    "cmdxprmgc002stezpuakd0y4x",
    "cmdxprmfe002qtezpnmiqvq6x",
    "cmdxprmee002otezpcdo0f2jg",
    "cmdxprkzv002mtezp41tqz4mu",
    "cmdxprkz0002jtezpw34s2jim",
    "cmdxprkyb002gtezpq32ijf8m",
    "cmdxprkxe002dtezpp6d052e2",
    "cmdxprjd4002atezpx1sv8ce9",
    "cmdxprj280028tezp55f28q72",
    "cmdxprj150022tezprk692eki",
    "cmdxpr48k001vtezp6p34oz9h",
    "cmdxpr47q001ntezp8qr0b6kt",
    "cmdxpr3s6001etezpca0my0bm",
    "cmdxpr3qk0018tezp7ewacjlp",
    "cmdxpqwob0012tezp7dg27mpd",
    "cmdxpqwlv000ytezpp0spcdrz",
    "cmdxpqwiy000gtezpnn3sm2zz",
    "cmdxpqwhx000dtezptsdoua39",
    "cmdxpqwgu000atezpwnrihhx9",
    "cmdxpqwfo0007tezpbpozq791",
    "cmdxpqwek0002tezpe5guk912",
    "cmdx9fvhf000ttebm2dfa21oy",
    "cmdx9fvgm000ltebmylho9pw4",
    "cmdx9fvfn000ftebme4wqwe6b",
    "cmdx9fveu0007tebm85y6ynz7",
    "cmdx8mqt30001te4hnwg3rptg",
    "cmdx8m6p8000bte4myo3v9q9d",
    "cmdx8m6ol0009te4m6x50et8z",
    "cmdx8m6nm0007te4mn5v0mtdl"
  ];
  
  console.error('🔧 技術的背景を含む詳細要約を再生成（バッチ処理）\n');
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
        
        console.error(`コンテンツ長: ${content.length}文字`);
        
        console.error('🔄 技術的背景を含む詳細要約を生成中...');
        const startTime = Date.now();
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          content
        );
        
        const duration = Date.now() - startTime;
        console.error(`生成時間: ${duration}ms`);
        
        // 要約をクリーンアップ
        let cleanedSummary = result.summary
          .replace(/^\\s*要約[:：]\\s*/gi, '')
          .replace(/\\*\\*/g, '')
          .trim();
        
        // 詳細要約の確認
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (newLines.length > 0) {
          const firstLine = newLines[0];
          console.error(`新しい第1項目: ${firstLine.substring(0, 50)}...`);
          
          // 「記事の主題は」で始まっているか確認
          if (firstLine.includes('記事の主題は')) {
            console.error('✅ 技術的背景を含む詳細要約を生成成功');
            
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
            console.error('⚠️ 技術的背景が生成されませんでした');
            errorCount++;
          }
        } else {
          console.error('⚠️ 詳細要約の生成に失敗');
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.error('\n' + '='.repeat(60));
    console.error('処理完了');
    console.error(`成功: ${successCount}件`);
    console.error(`スキップ: ${skipCount}件`);
    console.error(`エラー: ${errorCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixTechnicalBackgroundBatch().catch(console.error);