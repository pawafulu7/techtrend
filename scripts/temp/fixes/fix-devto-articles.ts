#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixDevtoArticles() {
  const articleIds = [
    "cme187l5g000btezxz9x7o986",
    "cme187l4m0005tezx17ia13ef",
    "cme0tartu00aytevw16elja06",
    "cme0lee0z0029tevw2qr0r0a5"
  ];
  
  console.error('🤖 Dev.toの問題記事を修正\n');
  console.error(`処理対象: ${articleIds.length}件\n`);
  
  try {
    // ローカルLLMクライアントを初期化
    const localLLM = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: 2500,
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
            detailedSummary: true
          }
        });
        
        if (!article) {
          console.error('❌ 記事が見つかりません');
          errorCount++;
          continue;
        }
        
        console.error(`タイトル: ${article.title?.substring(0, 50)}...`);
        
        // 現在の要約の状態を確認
        if (article.summary) {
          console.error(`現在の要約: ${article.summary.substring(0, 50)}...`);
        }
        if (article.detailedSummary) {
          const currentLines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
          console.error(`現在の詳細項目数: ${currentLines.length}`);
        }
        
        // コンテンツを構築
        let enhancedContent = article.content || '';
        
        // コンテンツが空または短い場合は強化
        if (enhancedContent.length < 300) {
          enhancedContent = `
Title: ${article.title}
URL: ${article.url}

Article Content:
${article.content || 'Technical article from Dev.to'}

Context: This is a technical article from Dev.to that discusses modern software development practices, tools, and methodologies. The article provides insights into practical implementation approaches and best practices for developers.
          `.trim();
        }
        
        console.error(`コンテンツ長: ${enhancedContent.length}文字`);
        
        console.error('🔄 詳細要約を生成中...');
        const startTime = Date.now();
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          enhancedContent
        );
        
        const duration = Date.now() - startTime;
        console.error(`生成時間: ${duration}ms`);
        
        // 要約をクリーンアップ（プレフィックスやMarkdown記法を除去）
        let cleanedSummary = result.summary
          .replace(/^\s*要約[:：]\s*/i, '')
          .replace(/^\s*\*\*要約\*\*[:：]?\s*/i, '')
          .replace(/\*\*/g, '')
          .replace(/##\s*/g, '')
          .trim();
        
        // 文末に句点がない場合は追加
        if (cleanedSummary && !cleanedSummary.endsWith('。')) {
          cleanedSummary = cleanedSummary + '。';
        }
        
        // 詳細要約もクリーンアップ
        let cleanedDetailedSummary = result.detailedSummary;
        if (cleanedDetailedSummary) {
          // 各行をクリーンアップ
          const lines = cleanedDetailedSummary.split('\n');
          const cleanedLines = lines.map(line => {
            if (line.trim().startsWith('・')) {
              // Markdown記法を除去
              return line.replace(/\*\*/g, '').replace(/^\s*・\s*\*\*要約[:：]\*\*\s*/i, '・');
            }
            return line;
          });
          cleanedDetailedSummary = cleanedLines.join('\n');
        }
        
        // 品質チェック
        const detailLines = cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        // 要約が50文字以上でOKとする（短い要約でも受け入れる）
        const summaryComplete = cleanedSummary.length >= 50 && cleanedSummary.endsWith('。');
        
        console.error(`\n📝 生成結果:`);
        console.error(`要約: ${cleanedSummary.substring(0, 60)}...`);
        console.error(`要約長: ${cleanedSummary.length}文字`);
        console.error(`詳細項目数: ${detailLines.length}`);
        console.error(`品質: ${(detailLines.length >= 5 && summaryComplete) ? '✅ 良好' : '⚠️ 要改善'}`);
        
        if (detailLines.length >= 5 && summaryComplete) {
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
              tags: {
                set: tagConnections
              },
              updatedAt: new Date()
            }
          });
          
          console.error('✅ 更新完了');
          successCount++;
        } else {
          console.error('⚠️ 品質が不十分なためスキップ');
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
    console.error(`エラー: ${errorCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDevtoArticles().catch(console.error);