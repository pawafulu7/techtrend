/**
 * 途切れた要約を修正するスクリプト
 */

import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../../lib/ai/gemini';

const prisma = new PrismaClient();

async function fixTruncatedSummary() {
  const articleId = 'cme2u3h5d0009te7fzswo3479';
  
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true }
  });
  
  if (!article) {
    console.error('記事が見つかりません');
    return;
  }
  
  console.error('記事タイトル:', article.title);
  console.error('\n現在の要約（途切れている）:');
  console.error(article.summary);
  console.error('文字数:', article.summary?.length);
  
  const geminiApiKey = process.env.GEMINI_API_KEY;
  
  if (!geminiApiKey) {
    console.error('\nGEMINI_API_KEY が設定されていないため、手動で修正します');
    
    // 手動で修正した要約
    const fixedSummary = '東京農工大学出身の髙田直輝氏が、JAXAでの研究補助アルバイト経験を経て、松尾研究所にシニアデータサイエンティストとして新卒入社。4年間のインターン経験を持つベテラン新卒としての入社エントリー。';
    
    console.error('\n修正後の要約:');
    console.error(fixedSummary);
    console.error('文字数:', fixedSummary.length);
    
    // データベースを更新
    await prisma.article.update({
      where: { id: articleId },
      data: { 
        summary: fixedSummary,
        updatedAt: new Date()
      }
    });
    
    console.error('\n✅ 要約を修正しました');
  } else {
    console.error('\nGemini APIで要約を再生成します...');
    
    const geminiClient = new GeminiClient(geminiApiKey);
    const content = article.content || article.summary || '';
    
    try {
      const newSummary = await geminiClient.generateSummary(article.title, content);
      
      console.error('\n新しい要約:');
      console.error(newSummary);
      console.error('文字数:', newSummary.length);
      
      await prisma.article.update({
        where: { id: articleId },
        data: { 
          summary: newSummary,
          updatedAt: new Date()
        }
      });
      
      console.error('\n✅ 要約を再生成しました');
    } catch (error) {
      console.error('エラー:', error);
      console.error('\n手動で修正します...');
      
      // エラー時は手動修正
      const fixedSummary = '東京農工大学出身の髙田直輝氏が、JAXAでの研究補助アルバイト経験を経て、松尾研究所にシニアデータサイエンティストとして新卒入社。4年間のインターン経験を持つベテラン新卒としての入社エントリー。';
      
      await prisma.article.update({
        where: { id: articleId },
        data: { 
          summary: fixedSummary,
          updatedAt: new Date()
        }
      });
      
      console.error('✅ 要約を手動修正しました');
    }
  }
  
  // 修正後の確認
  const updatedArticle = await prisma.article.findUnique({
    where: { id: articleId },
    select: { summary: true }
  });
  
  console.error('\n=== 修正完了 ===');
  console.error('最終的な要約:', updatedArticle?.summary);
  
  await prisma.$disconnect();
}

// スクリプト実行
fixTruncatedSummary().catch(error => {
  console.error('スクリプトエラー:', error);
  process.exit(1);
});