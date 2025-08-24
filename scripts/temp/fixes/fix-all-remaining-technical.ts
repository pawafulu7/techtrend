#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixAllRemainingTechnical() {
  console.error('🚀 技術的背景を含む詳細要約を一括再生成\n');
  
  try {
    // まず残りの記事IDを取得
    const articles = await prisma.article.findMany({
      where: {
        detailedSummary: { not: null }
      },
      select: {
        id: true,
        detailedSummary: true
      },
      orderBy: { createdAt: 'desc' },
      take: 1000
    });
    
    const needsFix = [];
    for (const article of articles) {
      if (article.detailedSummary) {
        const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (lines.length > 0) {
          const firstLine = lines[0];
          if (!firstLine.includes('記事の主題は')) {
            needsFix.push(article.id);
          }
        }
      }
    }
    
    // 既に修正済みのIDを除外
    const alreadyFixed = [
      // 第1バッチ
      'cmdy920k20007tek4veqeunzh',
      'cmdy91ji70005tek4sctz3zre',
      'cmdy4rmui0003teqqxkxpqbmg',
      'cmdy4rmtl0001teqq220y9bfl',
      'cmdy3i8fl001bte0yb4siigpj',
      // 第2バッチ
      'cme0lf3aj004utevw7zt49faq',
      'cme0lekh3003ctevwe7f3zizc',
      'cme0leiws0032tevwu41yev39',
      'cme0lehno002rtevweenus4ct',
      'cme0lecf2001rtevwizopb3sr',
      'cme0ldxv1000vtevwbognvizu',
      'cme0ldxun000ttevw1ttxz7h3',
      'cme0ldux6000ntevwf3svtuml',
      'cmdyhmmfx000qte7lw4m7p45c',
      'cmdyhmmd9000hte7lpsgek95g',
      'cmdyhmmcf000ete7l75sa60m7',
      'cmdyhmma20005te7lc2yw6ukz',
      'cmdyhmm900002te7lffybk5hh',
      'cmdy6wuir0003temnyia03kid',
      'cmdy6wuhw0001temnabz5p5pk',
      'cmdy3i8es0019te0y5uj7h3mq',
      'cmdy3i8e00017te0yd6x7zmvn',
      'cmdy3i8d50015te0y1gi08gh9',
      'cmdy3i8ce0013te0yzd303xp3',
      'cmdy3i8b70011te0y446v9z6t',
      // 第3バッチ
      'cme1ad8qc000jtehb9xk0ihuc',
      'cmdy3i8ad000zte0yag9j6giu',
      'cmdy3i89j000xte0y8rdtg2wp',
      'cmdy3i88p000vte0yiqoh3s45',
      'cmdy3i882000tte0yrrknarw0',
      'cmdy3i873000rte0ylrzs4mk5',
      'cmdy3i86f000pte0yo5qhr1aw',
      'cmdy3i85n000nte0y814cef70',
      'cmdy3i846000lte0ye7yosgg0',
      'cmdy3i82j000jte0yq6d2dcib',
      'cmdy3i81h000hte0y5vu8kwiw',
      'cmdy3i7zb000fte0ydo3bt03j',
      'cmdy3i7ym000dte0yk8dlo8ix',
      'cmdy3i7xu000bte0yzf6290kz',
      'cmdy3i7wv0009te0ygo9xkf0y',
      'cmdy3i7we0007te0yctsadkjw',
      'cmdy3i7vt0005te0y8gk1pls5',
      'cmdy3i7v30003te0yji2lg1j0',
      'cmdy3i7uc0001te0y9ix9qr4p',
      'cmdy2mj4z000lter9q03yjs63',
      'cmdy2mj48000jter9ju85ugpr',
      'cmdy2mj3a000hter9jk0fn414',
      'cmdy2mhnr000fter9eemrewtd',
      'cmdy2mhn0000cter9wfsks1v7',
      'cmdy2mgl00009ter99iv8aw06',
      'cmdy0hcwl0005teuer9udt16h',
      // 第4バッチ
      'cmdy0hcvs0002teue0kjaclad',
      'cmdy0hcoi0009teuepxtvdvio',
      'cmdy0hcnp0007teueaezr863s',
      'cmdxyc8yj000bteoygjb03d0e',
      'cmdxyc8xd0009teoyi7fdajpg',
      'cmdxyc8wc0007teoyqufceyg3',
      'cmdxybplx0005teoykxxeqhbv',
      'cmdxw71lt0009tedljmqphhfe',
      'cmdxw71l10007tedlxdphm984',
      'cmdxw71k40005tedlvnt99aiw',
      'cmdxw6ekz0003tedlvmnbkuoo',
      'cmdxu1uf5000cte8eaqo6sauz',
      'cmdxu1udp000ate8e5f0xbvvk',
      'cmdxu1sxo0008te8ej9vawum8',
      'cmdxu1swz0005te8e2f8l3teg',
      'cmdxu1swa0002te8ele9976ss',
      'cmdxrwpq80009telqve48zwg9',
      'cmdxrwpp80007telq4cl3720d',
      'cmdxrwpnq0005telqsqzykz1v',
      'cmdxrwplv0003telqzbowu0r1',
      'cmdxrwpkt0001telqjan8y4x6',
      'cmdxprmjz0030tezpogjatbcz',
      'cmdxprmj1002ytezpj0rv5k5j',
      'cmdxprmi5002wtezpsl0a72qv',
      // 第5バッチ
      'cmdxprmh7002utezpokwiqdg8',
      'cmdxprmgc002stezpuakd0y4x',
      'cmdxprmfe002qtezpnmiqvq6x',
      'cmdxprmee002otezpcdo0f2jg',
      'cmdxprkzv002mtezp41tqz4mu',
      'cmdxprkz0002jtezpw34s2jim',
      'cmdxprkyb002gtezpq32ijf8m',
      'cmdxprkxe002dtezpp6d052e2',
      'cmdxprjd4002atezpx1sv8ce9',
      'cmdxprj280028tezp55f28q72',
      'cmdxprj150022tezprk692eki',
      'cmdxpr48k001vtezp6p34oz9h',
      'cmdxpr47q001ntezp8qr0b6kt',
      'cmdxpr3s6001etezpca0my0bm',
      'cmdxpr3qk0018tezp7ewacjlp',
      'cmdxpqwob0012tezp7dg27mpd',
      'cmdxpqwlv000ytezpp0spcdrz',
      'cmdxpqwiy000gtezpnn3sm2zz',
      'cmdxpqwhx000dtezptsdoua39',
      'cmdxpqwgu000atezpwnrihhx9',
      'cmdxpqwfo0007tezpbpozq791',
      'cmdxpqwek0002tezpe5guk912',
      'cmdx9fvhf000ttebm2dfa21oy',
      'cmdx9fvgm000ltebmylho9pw4'
    ];
    
    const articleIds = needsFix.filter(id => !alreadyFixed.includes(id));
    
    console.error(`処理対象: ${articleIds.length}件\n`);
    
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
    
    // 進捗表示用
    const startTime = Date.now();
    
    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i];
      
      // 進捗表示（10件ごと）
      if (i % 10 === 0) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const rate = successCount / (elapsed / 60) || 0;
        console.error(`\n📊 進捗: ${i}/${articleIds.length} (${Math.round(i/articleIds.length*100)}%) - 成功: ${successCount}, スキップ: ${skipCount}, エラー: ${errorCount}`);
        console.error(`⏱️ 経過時間: ${Math.floor(elapsed/60)}分${elapsed%60}秒 - 処理速度: ${rate.toFixed(1)}件/分\n`);
      }
      
      console.error(`[${i + 1}/${articleIds.length}] 処理中: ${articleId}`);
      
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
        
        // 現在の詳細要約の確認
        if (article.detailedSummary) {
          const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
          if (lines.length > 0) {
            const firstLine = lines[0];
            
            // すでに「記事の主題は」で始まっている場合はスキップ
            if (firstLine.includes('記事の主題は')) {
              console.error('  ✅ すでに技術的背景が含まれています');
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
        
        console.error('  🔄 技術的背景を含む詳細要約を生成中...');
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          content
        );
        
        // 要約をクリーンアップ
        const cleanedSummary = result.summary
          .replace(/^\\s*要約[:：]\\s*/gi, '')
          .replace(/\\*\\*/g, '')
          .trim();
        
        // 詳細要約の確認
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (newLines.length > 0) {
          const firstLine = newLines[0];
          
          // 「記事の主題は」で始まっているか確認
          if (firstLine.includes('記事の主題は')) {
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
            
            console.error('  ✅ 技術的背景を含む詳細要約を生成成功');
            successCount++;
          } else {
            console.error('  ⚠️ 技術的背景が生成されませんでした');
            errorCount++;
          }
        } else {
          console.error('  ⚠️ 詳細要約の生成に失敗');
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`  ❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // レート制限対策（負荷を考慮して短めに）
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.error('\n' + '='.repeat(60));
    console.error('🎉 処理完了');
    console.error(`成功: ${successCount}件`);
    console.error(`スキップ: ${skipCount}件`);
    console.error(`エラー: ${errorCount}件`);
    console.error(`総処理時間: ${Math.floor(totalTime/60)}分${totalTime%60}秒`);
    console.error(`平均処理速度: ${(successCount / (totalTime / 60)).toFixed(1)}件/分`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllRemainingTechnical().catch(console.error);