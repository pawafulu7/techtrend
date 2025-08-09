import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import { checkContentQuality, createEnhancedPrompt } from '@/lib/utils/content-quality-checker';
import { normalizeTag } from '@/lib/utils/tag-normalizer';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

interface RegenerationResult {
  total: number;
  regenerated: number;
  improved: number;
  failed: number;
  errors: string[];
}

async function regenerateEnglishMixedSummaries() {
  console.log('🔄 英語混入要約の再生成を開始します...\n');
  
  const startTime = Date.now();
  const result: RegenerationResult = {
    total: 0,
    regenerated: 0,
    improved: 0,
    failed: 0,
    errors: []
  };
  
  try {
    // 問題のある記事IDを読み込み（事前に検出済みの場合）
    let targetArticleIds: number[] = [];
    
    try {
      const dataPath = path.join(process.cwd(), 'data', 'problematic-articles.json');
      const data = await fs.readFile(dataPath, 'utf-8');
      const parsed = JSON.parse(data);
      targetArticleIds = parsed.articleIds || [];
      console.log(`📁 保存済みの問題記事リストを読み込みました: ${targetArticleIds.length}件`);
    } catch {
      console.log('💡 保存済みリストがないため、全記事をチェックします');
    }
    
    // 対象記事を取得
    let articles;
    if (targetArticleIds.length > 0) {
      articles = await prisma.article.findMany({
        where: {
          id: { in: targetArticleIds }
        },
        include: { source: true }
      });
    } else {
      // 全記事をチェック
      articles = await prisma.article.findMany({
        where: {
          summary: { not: null }
        },
        include: { source: true },
        orderBy: { publishedAt: 'desc' }
      });
    }
    
    console.log(`\n🔍 検査対象: ${articles.length}件の記事`);
    
    // 英語混入問題がある記事を特定
    const problematicArticles = [];
    
    for (const article of articles) {
      const qualityCheck = checkContentQuality(
        article.summary || '',
        article.detailedSummary || undefined,
        article.title
      );
      
      // 英語混入問題がある、または再生成が必要な記事
      const hasLanguageMix = qualityCheck.issues.some(i => i.type === 'language_mix');
      if (hasLanguageMix || qualityCheck.requiresRegeneration) {
        problematicArticles.push({
          article,
          qualityCheck
        });
      }
    }
    
    result.total = problematicArticles.length;
    
    if (result.total === 0) {
      console.log('✅ 英語混入問題のある要約は見つかりませんでした！');
      return;
    }
    
    console.log(`\n⚠️  ${result.total}件の要約に問題が見つかりました`);
    console.log('再生成を開始します...\n');
    
    // Gemini API設定
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // 各記事の要約を再生成
    for (let i = 0; i < problematicArticles.length; i++) {
      const { article, qualityCheck } = problematicArticles[i];
      
      console.log(`\n[${i + 1}/${result.total}] ${article.title.substring(0, 50)}...`);
      console.log(`  現在のスコア: ${qualityCheck.score}/100`);
      
      try {
        const content = article.content || article.description || '';
        
        // 強化プロンプトで再生成
        const prompt = createEnhancedPrompt(
          article.title,
          content,
          qualityCheck.issues
        );
        
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
        const newSummary = data.candidates[0].content.parts[0].text.trim();
        
        // 新しい要約の品質をチェック
        const newQualityCheck = checkContentQuality(newSummary);
        
        console.log(`  新しいスコア: ${newQualityCheck.score}/100`);
        
        if (newQualityCheck.score > qualityCheck.score) {
          // 品質が改善された場合のみ更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: newSummary,
              summaryVersion: 4 // 英語混入修正版
            }
          });
          
          result.regenerated++;
          if (newQualityCheck.score >= 80) {
            result.improved++;
            console.log(`  ✅ 品質改善: ${qualityCheck.score} → ${newQualityCheck.score}`);
          } else {
            console.log(`  ⚠️  部分改善: ${qualityCheck.score} → ${newQualityCheck.score}`);
          }
        } else {
          console.log(`  ❌ 改善なし（更新をスキップ）`);
        }
        
        // API制限対策
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`  ❌ エラー: ${errorMessage}`);
        result.failed++;
        result.errors.push(`${article.title}: ${errorMessage}`);
      }
    }
    
    // キャッシュを無効化
    if (result.regenerated > 0) {
      console.log('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
    }
    
    // 結果サマリー
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n' + '=' .repeat(80));
    console.log('📊 再生成完了');
    console.log('=' .repeat(80));
    console.log(`  処理時間: ${duration}秒`);
    console.log(`  対象記事: ${result.total}件`);
    console.log(`  再生成成功: ${result.regenerated}件`);
    console.log(`  品質改善: ${result.improved}件`);
    console.log(`  失敗: ${result.failed}件`);
    
    if (result.regenerated > 0) {
      const improvementRate = Math.round(result.improved / result.regenerated * 100);
      console.log(`  改善率: ${improvementRate}%`);
    }
    
    if (result.errors.length > 0) {
      console.log('\n❌ エラー詳細:');
      result.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
    }
    
    // 結果をファイルに保存
    const reportDir = path.join(process.cwd(), 'reports');
    await fs.mkdir(reportDir, { recursive: true });
    
    const reportPath = path.join(
      reportDir,
      `regeneration-report-${new Date().toISOString().split('T')[0]}.json`
    );
    
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        executedAt: new Date(),
        result,
        duration
      }, null, 2)
    );
    
    console.log(`\n📁 レポートを保存しました: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ 再生成エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行
if (require.main === module) {
  regenerateEnglishMixedSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}