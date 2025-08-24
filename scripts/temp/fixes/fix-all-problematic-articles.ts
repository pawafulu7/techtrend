#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixAllProblematicArticles() {
  const articleIds = [
    "cme0tahvp00aitevwnu5s6wky",
    "cme0lfbb4006ptevwjhk5jyy1",
    "cme0lfamu006itevw9dx50xbe",
    "cme0lf9w3006ctevwb9fa9ylh",
    "cme0lf8vf0066tevw8uabiho9",
    "cme0lf89h005ztevwfed7a7lf",
    "cme0lf7l1005stevwhp2dalrl",
    "cme0lf6va005ltevwvuwnu7hl",
    "cme0lf54n005etevwg2yrc97g",
    "cme0lf4i70058tevw9np362kk",
    "cme0leo52004ptevwe0mnd35y",
    "cme0lenkh0047tevwz2np6qdz",
    "cme0lecf2001rtevwizopb3sr",
    "cme0lebmv001ltevwql3x3q1x"
  ];
  
  console.error('🧹 プレフィックス・Markdown記法の除去と詳細要約の修正\n');
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
      console.error('⚠️ プレフィックス・Markdown記法の除去のみ実行します\n');
    } else {
      console.error('✅ ローカルLLMサーバー接続成功\n');
    }
    
    let successCount = 0;
    let cleanupCount = 0;
    let regenerateCount = 0;
    
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
          continue;
        }
        
        console.error(`タイトル: ${article.title?.substring(0, 50)}...`);
        
        let needsUpdate = false;
        let cleanedSummary = article.summary || '';
        let cleanedDetailedSummary = article.detailedSummary || '';
        
        // 1. 要約のクリーンアップ
        if (article.summary) {
          const originalSummary = article.summary;
          cleanedSummary = article.summary
            .replace(/^\s*要約[:：]\s*/gi, '')
            .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
            .replace(/\*\*/g, '')
            .replace(/##\s*/g, '')
            .trim();
          
          if (cleanedSummary !== originalSummary) {
            console.error('📝 要約をクリーンアップ');
            needsUpdate = true;
            cleanupCount++;
          }
        }
        
        // 2. 詳細要約のクリーンアップ
        if (article.detailedSummary) {
          const originalDetailed = article.detailedSummary;
          const lines = originalDetailed.split('\n');
          const cleanedLines = lines.map(line => {
            if (line.trim().startsWith('・')) {
              return line
                .replace(/^\s*・\s*\*\*要約[:：]\*\*\s*/gi, '・')
                .replace(/^\s*・\s*要約[:：]\s*/gi, '・')
                .replace(/\*\*/g, '')
                .replace(/##\s*/g, '');
            }
            return line;
          });
          cleanedDetailedSummary = cleanedLines.join('\n');
          
          if (cleanedDetailedSummary !== originalDetailed) {
            console.error('📝 詳細要約をクリーンアップ');
            needsUpdate = true;
            cleanupCount++;
          }
        }
        
        // 3. 詳細要約が不足している場合は再生成
        const detailLines = cleanedDetailedSummary ? 
          cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・')).length : 0;
        
        if (detailLines < 6 && connected) {
          console.error(`⚠️ 詳細要約が${detailLines}項目しかないため再生成`);
          
          // コンテンツを準備
          let content = article.content || '';
          if (content.length < 300) {
            content = `
Title: ${article.title}
URL: ${article.url}
Source: ${article.source?.name}

Article Content:
${article.content || 'Technical article content'}
            `.trim();
          }
          
          console.error('🔄 詳細要約を生成中...');
          const startTime = Date.now();
          
          try {
            const result = await localLLM.generateDetailedSummary(
              article.title || '',
              content
            );
            
            const duration = Date.now() - startTime;
            console.error(`生成時間: ${duration}ms`);
            
            // 生成結果をクリーンアップ
            cleanedSummary = result.summary
              .replace(/^\s*要約[:：]\s*/gi, '')
              .replace(/\*\*/g, '')
              .trim();
            
            cleanedDetailedSummary = result.detailedSummary;
            const newDetailLines = cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・')).length;
            
            if (newDetailLines >= 6) {
              console.error(`✅ 詳細要約を${newDetailLines}項目で生成成功`);
              needsUpdate = true;
              regenerateCount++;
              
              // タグも更新
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
              
              // データベースを更新（タグ含む）
              await prisma.article.update({
                where: { id: articleId },
                data: {
                  summary: cleanedSummary,
                  detailedSummary: cleanedDetailedSummary,
                  tags: { set: tagConnections },
                  updatedAt: new Date()
                }
              });
              successCount++;
              continue;
            } else {
              console.error(`⚠️ 生成された詳細要約が${newDetailLines}項目のため、クリーンアップのみ実行`);
            }
          } catch (error) {
            console.error('⚠️ 再生成エラー。クリーンアップのみ実行');
          }
        }
        
        // 4. クリーンアップのみの更新
        if (needsUpdate) {
          await prisma.article.update({
            where: { id: articleId },
            data: {
              summary: cleanedSummary,
              detailedSummary: cleanedDetailedSummary,
              updatedAt: new Date()
            }
          });
          console.error('✅ 更新完了');
          successCount++;
        } else {
          console.error('ℹ️ 更新不要');
        }
        
      } catch (error: any) {
        console.error(`❌ エラー: ${error.message || error}`);
      }
      
      // レート制限対策
      if (connected && detailLines < 6) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.error('\n' + '='.repeat(60));
    console.error('処理完了');
    console.error(`更新: ${successCount}件`);
    console.error(`クリーンアップ: ${cleanupCount}件`);
    console.error(`詳細要約再生成: ${regenerateCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllProblematicArticles().catch(console.error);