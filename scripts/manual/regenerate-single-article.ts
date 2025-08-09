#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { checkContentQuality, fixSummary } from '@/lib/utils/content-quality-checker';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function regenerateSingleArticle() {
  const articleId = 'cme3sdz74000fte6gig7urb0t';
  
  console.log('📋 記事の要約再生成を開始します');
  console.log('=====================================\n');
  
  try {
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true }
    });
    
    if (!article) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.log('📰 記事情報:');
    console.log(`  タイトル: ${article.title}`);
    console.log(`  ソース: ${article.source.name}`);
    console.log(`  URL: ${article.url}`);
    console.log('');
    
    console.log('❌ 現在の要約の問題点:');
    console.log(`  一覧要約: "${article.summary}"`);
    console.log(`  文字数: ${article.summary?.length || 0}文字 (目標: 80-120文字)`);
    console.log(`  問題: 文字数が38文字と短すぎる、内容が不明瞭`);
    console.log('');
    
    console.log('❌ 詳細要約の問題点:');
    console.log(`  文字数: ${article.detailedSummary?.length || 0}文字`);
    console.log(`  問題: 箇条書き形式が不自然、内容が断片的`);
    console.log('');
    
    // 新しい要約を生成
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // 改善されたプロンプト
    const prompt = `以下の技術記事の要約を作成してください。

タイトル: ${article.title}
URL: ${article.url}

内容の概要（メタデータより）:
ChatGPTの最新モデルGPT-5に特定の単語（「植物百科通」など）を入力すると、異常な挙動を示すという現象について解説した記事です。
これらの単語は「グリッチトークン」と呼ばれ、LLMの学習データや処理の限界を探る手法として紹介されています。

要求事項：
1. 簡潔な要約（80-120文字、必ず日本語で）:
   - 記事の主要なトピックを明確に説明
   - 「グリッチトークン」という専門用語を含める
   - LLMの脆弱性や限界についての言及を含める

2. 詳細な要約（200-400文字、日本語の自然な文章で）:
   - グリッチトークンとは何かを説明
   - 「植物百科通」の例を含める
   - LLMがなぜ異常な挙動を示すのかの理由
   - この現象の意義や活用方法

重要：箇条書きではなく、流れのある日本語の文章で記述してください。

回答フォーマット（JSON形式）:
{
  "summary": "簡潔な要約",
  "detailedSummary": "詳細な要約",
  "tags": ["タグ1", "タグ2", "タグ3"]
}`;

    console.log('🔄 Gemini APIで要約を再生成中...');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1200
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    const responseText = data.candidates[0].content.parts[0].text.trim();
    
    // JSONを抽出
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSONの抽出に失敗しました');
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    console.log('\n✅ 新しい要約:');
    console.log(`  一覧要約: "${result.summary}"`);
    console.log(`  文字数: ${result.summary.length}文字`);
    
    // 品質チェック
    const qualityCheck = checkContentQuality(result.summary, result.detailedSummary, article.title);
    console.log(`  品質スコア: ${qualityCheck.score}/100`);
    
    // 必要に応じて修正
    if (qualityCheck.issues.length > 0 && !qualityCheck.requiresRegeneration) {
      result.summary = fixSummary(result.summary, qualityCheck.issues);
      console.log(`  修正後: "${result.summary}"`);
    }
    
    console.log('\n✅ 詳細要約:');
    console.log(`  ${result.detailedSummary}`);
    console.log(`  文字数: ${result.detailedSummary.length}文字`);
    
    // データベース更新
    await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        summaryVersion: 4
      }
    });
    
    console.log('\n✅ データベースを更新しました');
    
    // タグの処理
    if (result.tags && result.tags.length > 0) {
      console.log(`\n📌 タグ: ${result.tags.join(', ')}`);
      
      // タグをデータベースに追加
      const tagRecords = await Promise.all(
        result.tags.map(async (tagName: string) => {
          const existingTag = await prisma.tag.findUnique({
            where: { name: tagName }
          });
          
          if (existingTag) {
            return existingTag;
          }
          
          return await prisma.tag.create({
            data: { name: tagName }
          });
        })
      );
      
      // 記事にタグを関連付ける
      await prisma.article.update({
        where: { id: articleId },
        data: {
          tags: {
            set: [],  // 既存のタグをクリア
            connect: tagRecords.map(tag => ({ id: tag.id }))
          }
        }
      });
    }
    
    // キャッシュ無効化
    await cacheInvalidator.invalidateArticle(articleId);
    console.log('\n🔄 キャッシュを無効化しました');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行
if (require.main === module) {
  regenerateSingleArticle()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}