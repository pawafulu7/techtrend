#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { AIService } from '../../lib/ai/ai-service';

const prisma = new PrismaClient();

async function fixMalformedSummaries() {
  console.error('🔧 不正な形式の要約を修正中...\n');
  
  try {
    // 環境変数を一時的にGemini APIに設定
    process.env.USE_LOCAL_LLM = 'false';
    const aiService = AIService.fromEnv();
    
    // 修正対象のIDリスト
    const targetIds = [
      'cme161hh3000wte0t7lyr8lk9', // 最初に報告された記事
      'cmdq3y8fl0003te56qr5cgvsn',
      'cmdq3y8h5000jte56gusmhm2p',
      'cmdq3y8ii000xte564bsptjx9',
      'cmdq3y8jo0019te56pgthlvth',
      'cmdq3ya6u0049te56sbr966b3',
      'cmdq3ya7c004dte56wype86xx',
      'cmdq44l1d001tte3tmybdm2yh',
      'cmdq4ou6u001jterllu47t0f5',
      'cmdqmf40z0001te3qm7aric31',
      'cmdrgpeu7000aten2m9z2m7pl'
    ];
    
    console.error(`処理対象: ${targetIds.length}件\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < targetIds.length; i++) {
      const articleId = targetIds[i];
      
      console.error(`\n[${i + 1}/${targetIds.length}] 処理中: ${articleId}`);
      
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
        
        console.error(`タイトル: ${article.title?.substring(0, 60)}...`);
        
        // コンテンツがない場合はURLから取得を試みる
        let content = article.content;
        if (!content && article.url) {
          console.error('⚠️ コンテンツがないため、タイトルとURLから生成');
          content = `
記事タイトル: ${article.title}
記事URL: ${article.url}

この記事は外部サイトの記事です。詳細な内容は元記事をご確認ください。
          `.trim();
        }
        
        if (!content) {
          console.error('❌ コンテンツが取得できません');
          errorCount++;
          continue;
        }
        
        console.error('🌟 Gemini APIで詳細要約を再生成中...');
        const startTime = Date.now();
        
        // 詳細要約を生成
        const result = await aiService.generateDetailedSummary(
          article.title || '',
          content
        );
        
        const duration = Date.now() - startTime;
        
        // 品質チェック
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        console.error(`生成時間: ${duration}ms`);
        console.error(`項目数: ${newLines.length}`);
        
        // Markdown記法を除去
        const cleanSummary = result.summary
          .replace(/\*\*/g, '') // Bold記法を除去
          .replace(/##\s*/g, '') // 見出し記法を除去
          .trim();
        
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
            summary: cleanSummary,
            detailedSummary: result.detailedSummary,
            tags: {
              set: tagConnections
            },
            updatedAt: new Date()
          }
        });
        
        if (newLines.length === 6) {
          console.error('✅ 6項目で正常に再生成されました');
        } else {
          console.error(`✅ ${newLines.length}項目で生成完了`);
        }
        successCount++;
        
      } catch (error: any) {
        console.error(`❌ エラー: ${error.message || error}`);
        errorCount++;
        
        // レート制限エラーの場合は待機
        if (error.message?.includes('503') || error.message?.includes('overload')) {
          console.error('⏳ レート制限のため30秒待機...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.error('\n' + '='.repeat(60));
    console.error('処理完了');
    console.error(`成功: ${successCount}件`);
    console.error(`エラー: ${errorCount}件`);
    
    // 修正後の確認
    if (successCount > 0) {
      console.error('\n📝 修正された記事の確認（最初の1件）');
      const fixedArticle = await prisma.article.findUnique({
        where: { id: targetIds[0] },
        select: {
          id: true,
          title: true,
          summary: true,
          detailedSummary: true
        }
      });
      
      if (fixedArticle) {
        console.error(`\nID: ${fixedArticle.id}`);
        console.error(`タイトル: ${fixedArticle.title?.substring(0, 50)}...`);
        console.error(`\n要約:`, fixedArticle.summary?.substring(0, 100));
        
        const lines = fixedArticle.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
        console.error(`\n詳細要約の項目数: ${lines.length}`);
        
        // Markdown記法のチェック
        const hasMarkdown = fixedArticle.summary?.includes('**') || fixedArticle.summary?.includes('## ');
        console.error(`Markdown記法: ${hasMarkdown ? '❌ あり' : '✅ なし'}`);
      }
    }
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
fixMalformedSummaries().catch(console.error);