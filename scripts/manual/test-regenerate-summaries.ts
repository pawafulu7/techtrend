#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { AIService } from '@/lib/ai/ai-service';

const prisma = new PrismaClient();

async function testRegenerateSummaries() {
  console.error('🧪 簡略化された詳細要約の再生成テスト\n');
  console.error('='.repeat(60));
  
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
      console.error('✅ 簡略化された詳細要約を持つ記事はありません');
      return;
    }

    console.error('📄 対象記事:');
    console.error(`  ID: ${article.id}`);
    console.error(`  タイトル: ${article.title}`);
    console.error(`  ソース: ${article.source.name}`);
    console.error();
    
    console.error('【現在の詳細要約（簡略版）】');
    console.error(article.detailedSummary);
    console.error();
    
    // 詳細要約の項目数を確認
    const currentBulletPoints = article.detailedSummary?.split('\n').filter(line => line.trim().startsWith('・')) || [];
    console.error(`項目数: ${currentBulletPoints.length}個`);
    console.error();
    
    // AIサービスを使用して詳細要約を再生成
    console.error('📝 詳細要約を再生成中...');
    const aiService = AIService.fromEnv();
    
    const startTime = Date.now();
    const result = await aiService.generateDetailedSummary(
      article.title,
      article.content || article.title
    );
    const duration = Date.now() - startTime;
    
    console.error('✅ 再生成完了\n');
    console.error('【新しい詳細要約（6項目版）】');
    console.error(result.detailedSummary);
    console.error();
    
    // 新しい詳細要約の項目数を確認
    const newBulletPoints = result.detailedSummary.split('\n').filter(line => line.trim().startsWith('・'));
    console.error(`項目数: ${newBulletPoints.length}個 ${newBulletPoints.length === 6 ? '✅' : '⚠️'}`);
    
    // 必須キーワードのチェック
    const requiredKeywords = [
      '記事の主題',
      '具体的な問題',
      '提示されている解決策',
      '実装方法',
      '期待される効果',
      '実装時の注意点'
    ];
    
    console.error('\n項目別チェック:');
    requiredKeywords.forEach((keyword, index) => {
      const hasKeyword = newBulletPoints[index]?.includes(keyword) || false;
      console.error(`  ${index + 1}. 「${keyword}」: ${hasKeyword ? '✅' : '❌'}`);
    });
    
    console.error('\n-'.repeat(60));
    console.error(`処理時間: ${duration}ms`);
    
    // データベースを更新するかの確認
    console.error('\n📊 データベース更新のテスト（実際には更新しません）');
    console.error('  以下のSQLが実行される予定:');
    console.error(`  UPDATE Article SET detailedSummary = '[新しい詳細要約]' WHERE id = '${article.id}'`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
  
  console.error('\n' + '='.repeat(60));
  console.error('テスト完了');
}

// テスト実行
testRegenerateSummaries().catch(console.error);