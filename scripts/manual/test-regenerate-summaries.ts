#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { AIService } from '@/lib/ai/ai-service';

const prisma = new PrismaClient();

async function testRegenerateSummaries() {
  console.log('🧪 簡略化された詳細要約の再生成テスト\n');
  console.log('='.repeat(60));
  
  try {
    // 簡略化された詳細要約を持つ記事を1件取得
    const article = await prisma.article.findFirst({
      where: {
        detailedSummary: {
          contains: '実装方法の詳細については、記事内のコード例や手順を参照してください'
        }
      },
      include: {
        source: true,
        tags: true
      }
    });

    if (!article) {
      console.log('✅ 簡略化された詳細要約を持つ記事はありません');
      return;
    }

    console.log('📄 対象記事:');
    console.log(`  ID: ${article.id}`);
    console.log(`  タイトル: ${article.title}`);
    console.log(`  ソース: ${article.source.name}`);
    console.log();
    
    console.log('【現在の詳細要約（簡略版）】');
    console.log(article.detailedSummary);
    console.log();
    
    // 詳細要約の項目数を確認
    const currentBulletPoints = article.detailedSummary?.split('\n').filter(line => line.trim().startsWith('・')) || [];
    console.log(`項目数: ${currentBulletPoints.length}個`);
    console.log();
    
    // AIサービスを使用して詳細要約を再生成
    console.log('📝 詳細要約を再生成中...');
    const aiService = AIService.fromEnv();
    
    const startTime = Date.now();
    const result = await aiService.generateDetailedSummary(
      article.title,
      article.content || article.title
    );
    const duration = Date.now() - startTime;
    
    console.log('✅ 再生成完了\n');
    console.log('【新しい詳細要約（6項目版）】');
    console.log(result.detailedSummary);
    console.log();
    
    // 新しい詳細要約の項目数を確認
    const newBulletPoints = result.detailedSummary.split('\n').filter(line => line.trim().startsWith('・'));
    console.log(`項目数: ${newBulletPoints.length}個 ${newBulletPoints.length === 6 ? '✅' : '⚠️'}`);
    
    // 必須キーワードのチェック
    const requiredKeywords = [
      '記事の主題',
      '具体的な問題',
      '提示されている解決策',
      '実装方法',
      '期待される効果',
      '実装時の注意点'
    ];
    
    console.log('\n項目別チェック:');
    requiredKeywords.forEach((keyword, index) => {
      const hasKeyword = newBulletPoints[index]?.includes(keyword) || false;
      console.log(`  ${index + 1}. 「${keyword}」: ${hasKeyword ? '✅' : '❌'}`);
    });
    
    console.log('\n-'.repeat(60));
    console.log(`処理時間: ${duration}ms`);
    
    // データベースを更新するかの確認
    console.log('\n📊 データベース更新のテスト（実際には更新しません）');
    console.log('  以下のSQLが実行される予定:');
    console.log(`  UPDATE Article SET detailedSummary = '[新しい詳細要約]' WHERE id = '${article.id}'`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('テスト完了');
}

// テスト実行
testRegenerateSummaries().catch(console.error);