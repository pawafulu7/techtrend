#!/usr/bin/env node

/**
 * AWS記事のエンリッチメント実行スクリプト
 * 既存のAWS記事を取得し、エンリッチメントを実行してコンテンツを更新する
 */

import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../../lib/enrichers';
import * as dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

const prisma = new PrismaClient();

// プログレスバーの表示用
function showProgress(current: number, total: number, message: string = '') {
  const percentage = Math.round((current / total) * 100);
  const barLength = 40;
  const filled = Math.round((current / total) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  
  process.stdout.write(`\r[${bar}] ${percentage}% (${current}/${total}) ${message}`);
  
  if (current === total) {
    process.stdout.write('\n');
  }
}

async function enrichAwsArticles() {
  console.log('AWS記事エンリッチメント処理を開始します...\n');
  
  try {
    // AWSソースのIDを取得
    const awsSource = await prisma.source.findFirst({
      where: { name: 'AWS' }
    });
    
    if (!awsSource) {
      console.error('AWSソースが見つかりません');
      return;
    }
    
    // AWS記事を取得
    const articles = await prisma.article.findMany({
      where: { sourceId: awsSource.id },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`対象記事数: ${articles.length}件\n`);
    
    // ドライラン確認
    const isDryRun = process.argv.includes('--dry-run');
    if (isDryRun) {
      console.log('🔍 ドライランモード: 実際の更新は行いません\n');
    }
    
    // エンリッチャーファクトリーの初期化
    const enricherFactory = new ContentEnricherFactory();
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    const errors: { url: string; error: string }[] = [];
    
    // 各記事に対してエンリッチメントを実行
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const currentIndex = i + 1;
      
      try {
        // 既に十分なコンテンツがある場合はスキップ（5000文字以上）
        if (article.content && article.content.length > 5000) {
          skipCount++;
          showProgress(currentIndex, articles.length, `スキップ: ${article.title?.substring(0, 30)}...`);
          continue;
        }
        
        // エンリッチャーを取得
        const enricher = enricherFactory.getEnricher(article.url);
        
        if (!enricher) {
          failCount++;
          errors.push({ url: article.url, error: 'エンリッチャーが見つかりません' });
          showProgress(currentIndex, articles.length, `失敗: エンリッチャーなし`);
          continue;
        }
        
        showProgress(currentIndex, articles.length, `処理中: ${article.title?.substring(0, 30)}...`);
        
        // エンリッチメント実行
        const enrichedContent = await enricher.enrich(article.url);
        
        if (!enrichedContent || !enrichedContent.content) {
          failCount++;
          errors.push({ url: article.url, error: 'コンテンツの取得に失敗' });
          continue;
        }
        
        // データベース更新（ドライランの場合はスキップ）
        if (!isDryRun) {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              content: enrichedContent.content,
              thumbnail: enrichedContent.thumbnail || article.thumbnail,
              updatedAt: new Date()
            }
          });
        }
        
        successCount++;
        
        // 元のコンテンツ長と新しいコンテンツ長を記録
        console.log(`\n✅ ${article.title?.substring(0, 50)}...`);
        console.log(`   元: ${article.content?.length || 0}文字 → 新: ${enrichedContent.content.length}文字`);
        
        // レート制限（1.5秒待機）
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        failCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ url: article.url, error: errorMessage });
        showProgress(currentIndex, articles.length, `エラー: ${errorMessage.substring(0, 30)}...`);
      }
    }
    
    // 結果サマリー
    console.log('\n\n========================================');
    console.log('エンリッチメント処理完了');
    console.log('========================================');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`⏭️  スキップ: ${skipCount}件（既に十分なコンテンツ）`);
    console.log(`❌ 失敗: ${failCount}件`);
    
    // エラー詳細
    if (errors.length > 0) {
      console.log('\n❌ エラー詳細:');
      errors.slice(0, 10).forEach(({ url, error }) => {
        console.log(`  - ${url}: ${error}`);
      });
      
      if (errors.length > 10) {
        console.log(`  ... 他 ${errors.length - 10}件のエラー`);
      }
    }
    
    // 統計情報
    if (successCount > 0 && !isDryRun) {
      const updatedArticles = await prisma.article.findMany({
        where: { sourceId: awsSource.id },
        select: { content: true }
      });
      
      const contentLengths = updatedArticles.map(a => a.content?.length || 0);
      const avgLength = Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length);
      const maxLength = Math.max(...contentLengths);
      const minLength = Math.min(...contentLengths.filter(l => l > 0));
      
      console.log('\n📊 統計情報:');
      console.log(`  平均コンテンツ長: ${avgLength}文字`);
      console.log(`  最大コンテンツ長: ${maxLength}文字`);
      console.log(`  最小コンテンツ長: ${minLength}文字`);
    }
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン処理の実行
enrichAwsArticles().catch(error => {
  console.error('予期しないエラー:', error);
  process.exit(1);
});