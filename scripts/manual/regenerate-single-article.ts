#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { checkContentQuality, fixSummary } from '@/lib/utils/content-quality-checker';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function regenerateSingleArticle(articleId: string) {
  
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
    
    // コンテンツを取得（既存のコンテンツを使用）
    const content = article.content || '';
    
    if (!content) {
      console.error('❌ コンテンツが保存されていません');
      console.log('手動で記事を追加した際にエンリッチャーでコンテンツを取得済みのはずです');
      return;
    }
    
    console.log(`📄 保存済みコンテンツ: ${content.length}文字`);
    
    // 新しい要約を生成
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // Speaker Deck用の特別なプロンプト
    let prompt: string;
    
    if (article.source.name === 'Speaker Deck') {
      // Speaker Deck専用プロンプト：内容に基づくタグ生成を重視
      prompt = `以下の技術プレゼンテーションの要約を作成してください。

タイトル: ${article.title}
URL: ${article.url}

プレゼン内容:
${content.substring(0, 8000)}

要求事項：
1. 簡潔な要約（100-150文字、必ず日本語で）:
   - プレゼンの主要なトピックを明確に説明
   - 具体的な技術や手法について言及
   - 実践的な知見や学びに焦点を当てる

2. 詳細な要約（200-400文字、日本語の自然な文章で）:
   - プレゼンで紹介されている主要な概念や理論
   - 具体的な事例や実践的な手法
   - 得られる知見や学び
   - 技術的な要点やベストプラクティス

3. タグ生成の重要な指示:
   - プレゼンの内容に直接関連する技術用語やトピックをタグとして選択
   - 発表者の所属組織名（メルカリ、デジタル庁など）は、その組織特有の事例や手法を説明している場合のみタグに含める
   - 一般的すぎるタグ（例：データ、分析）より、具体的なタグ（例：データ品質、KPI設計、ダッシュボード設計）を優先
   - プレゼンで実際に議論されているトピックに基づいてタグを選択

重要：箇条書きではなく、流れのある日本語の文章で記述してください。

回答フォーマット（JSON形式）:
{
  "summary": "簡潔な要約",
  "detailedSummary": "詳細な要約",
  "tags": ["タグ1", "タグ2", "タグ3"]
}`;
    } else {
      // 通常のプロンプト（既存処理）
      prompt = `以下の技術プレゼンテーションの要約を作成してください。

タイトル: ${article.title}
URL: ${article.url}

プレゼン内容:
${content.substring(0, 8000)}

要求事項：
1. 簡潔な要約（100-150文字、必ず日本語で）:
   - プレゼンの主要なトピックを明確に説明
   - メルカリとデジタル庁での経験について言及
   - データ活用の組織的な成功要因に焦点を当てる

2. 詳細な要約（200-400文字、日本語の自然な文章で）:
   - メルカリでのデータ分析の経験と学び
   - デジタル庁での政策ダッシュボードプロジェクト
   - データ活用における組織構造の重要性
   - Principal-Agentモデルなどの理論的枠組み

重要：箇条書きではなく、流れのある日本語の文章で記述してください。

回答フォーマット（JSON形式）:
{
  "summary": "簡潔な要約",
  "detailedSummary": "詳細な要約",
  "tags": ["タグ1", "タグ2", "タグ3"]
}`;
    }

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
          maxOutputTokens: 2500
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
  const articleId = process.argv[2];
  
  if (!articleId) {
    console.error('❌ エラー: 記事IDを指定してください');
    console.error('使用方法: npx tsx scripts/manual/regenerate-single-article.ts <記事ID>');
    console.error('例: npx tsx scripts/manual/regenerate-single-article.ts cmenp97rz0002tebkmpxrfhbh');
    process.exit(1);
  }
  
  regenerateSingleArticle(articleId)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}