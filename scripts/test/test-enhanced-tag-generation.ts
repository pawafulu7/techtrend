#!/usr/bin/env npx tsx
/**
 * 改善されたタグ生成機能のテスト
 */

import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { TagNormalizer } from '../../lib/services/tag-normalizer';

async function testEnhancedTagGeneration() {
  console.error('='.repeat(60));
  console.error('🧪 改善されたタグ生成機能のテスト');
  console.error('='.repeat(60));
  
  // テスト用の記事データ
  const testArticles = [
    {
      title: 'Claude CodeとChatGPTを使ったAI開発の比較',
      content: 'Claude CodeとChatGPT-4を使った開発体験を比較しました。Claude Codeはコード生成の精度が高く、ChatGPTは汎用性に優れています。両方のLLMを使い分けることで効率的な開発が可能です。'
    },
    {
      title: 'React.jsとNext.js 14でのフルスタック開発',
      content: 'ReactとNext.js 14を使ってフルスタックアプリケーションを開発しました。TypeScriptを使用し、バックエンドはNode.jsで構築。データベースにはPostgreSQLを採用しました。'
    }
  ];
  
  const summaryService = new UnifiedSummaryService();
  
  for (const article of testArticles) {
    console.error('\n' + '-'.repeat(40));
    console.error(`📝 記事: ${article.title}`);
    console.error('-'.repeat(40));
    
    try {
      // 要約とタグを生成
      const result = await summaryService.generate(
        article.title,
        article.content
      );
      
      console.error('\n生成結果:');
      console.error(`  タグ: ${result.tags.join(', ')}`);
      console.error(`  カテゴリ: ${result.category || 'なし'}`);
      
      // タグの正規化を確認
      console.error('\n正規化の確認:');
      const normalizedTags = TagNormalizer.normalizeTags(result.tags);
      for (const tag of normalizedTags) {
        console.error(`  - ${tag.name} (${tag.category || 'カテゴリなし'})`);
      }
      
    } catch (error) {
      console.error(`❌ エラー: ${error.message}`);
    }
  }
  
  console.error('\n' + '='.repeat(60));
  console.error('✅ テスト完了');
  console.error('='.repeat(60));
}

testEnhancedTagGeneration().catch(console.error);