#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixAllDevto() {
  console.error('🔧 Dev.to全記事の要約を改善\n');
  
  try {
    // Dev.toの全記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: { name: 'Dev.to' }
      },
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
    
    console.error(`Dev.to記事総数: ${articles.length}件\n`);
    
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
      return;
    }
    console.error('✅ ローカルLLMサーバー接続成功\n');
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      
      // 進捗表示
      if (i % 10 === 0 && i > 0) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.error(`\n📊 進捗: ${i}/${articles.length} (${Math.round(i/articles.length*100)}%)`);
        console.error(`✅ 成功: ${successCount}, ⏭️ スキップ: ${skipCount}, ❌ エラー: ${errorCount}`);
        console.error(`⏱️ 経過: ${Math.floor(elapsed/60)}分${elapsed%60}秒\n`);
      }
      
      console.error(`[${i + 1}/${articles.length}] 処理中: ${article.id}`);
      console.error(`  📝 ${article.title?.substring(0, 50)}...`);
      
      // 現在の要約をチェック
      const currentSummary = article.summary || '';
      const issues = [];
      
      if (currentSummary.length < 60) issues.push('短い');
      if (currentSummary.length > 130) issues.push('長い');
      
      const japaneseChars = (currentSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
      const japaneseRatio = currentSummary.length > 0 ? japaneseChars / currentSummary.length : 0;
      if (japaneseRatio < 0.5) issues.push('英語');
      
      if (currentSummary.includes('解説') || 
          currentSummary.includes('紹介') || 
          currentSummary.includes('説明') ||
          currentSummary.includes('する記事') ||
          currentSummary.includes('した記事')) {
        issues.push('一般的');
      }
      
      // 問題がない場合はスキップ
      if (issues.length === 0 && currentSummary.length > 0) {
        console.error(`  ⏭️ スキップ（問題なし）`);
        skipCount++;
        continue;
      }
      
      if (issues.length > 0) {
        console.error(`  ⚠️ 問題: ${issues.join(', ')}`);
      }
      
      try {
        // タイトルから具体的な内容を推測
        const title = article.title || '';
        let specificTopic = '';
        let expectedContent = '';
        
        // AIツール関連
        if (title.match(/GPT|Claude|Gemini|LLM|AI|Copilot|ChatGPT/i)) {
          specificTopic = 'AI/LLMツール';
          expectedContent = 'モデルの特徴、使用方法、APIの実装、プロンプト技術';
        }
        // フレームワーク
        else if (title.match(/React|Vue|Angular|Next\.js|Nuxt|Svelte|Remix/i)) {
          specificTopic = 'フロントエンドフレームワーク';
          expectedContent = 'コンポーネント実装、状態管理、パフォーマンス最適化';
        }
        // バックエンド
        else if (title.match(/Node|Express|FastAPI|Django|Rails|Spring/i)) {
          specificTopic = 'バックエンド開発';
          expectedContent = 'API設計、データベース連携、認証実装';
        }
        // DevOps
        else if (title.match(/Docker|Kubernetes|CI\/CD|GitHub Actions|Jenkins/i)) {
          specificTopic = 'DevOps/インフラ';
          expectedContent = 'コンテナ化、自動化、デプロイメント戦略';
        }
        // データベース
        else if (title.match(/SQL|MongoDB|Redis|PostgreSQL|MySQL|Database/i)) {
          specificTopic = 'データベース';
          expectedContent = 'クエリ最適化、スキーマ設計、パフォーマンスチューニング';
        }
        // ツール比較
        else if (title.match(/vs\.|versus|comparison|compare/i)) {
          specificTopic = '技術比較';
          expectedContent = '性能比較、特徴の違い、使い分けの指針';
        }
        // チュートリアル
        else if (title.match(/tutorial|guide|how to|build|create/i)) {
          specificTopic = '実装チュートリアル';
          expectedContent = 'ステップバイステップの手順、コード例、設定方法';
        }
        // パフォーマンス
        else if (title.match(/performance|fast|speed|optimize/i)) {
          specificTopic = 'パフォーマンス改善';
          expectedContent = '最適化手法、ベンチマーク結果、具体的な数値';
        }
        
        // コンテンツを準備
        const content = `
Title: ${article.title}
URL: ${article.url}
Source: Dev.to - Developer Community Platform

Topic Category: ${specificTopic || '技術記事'}
Expected Content: ${expectedContent || '技術的な実装や手法'}

Article Content (if available):
${article.content?.substring(0, 1000) || 'Content not available - use title to infer'}

タイトルから推測される具体的な内容:
${title.includes('Build') ? '- 実装手順とアーキテクチャ構築' : ''}
${title.includes('vs') ? '- 複数技術の比較と選定基準' : ''}
${title.includes('Guide') || title.includes('Tutorial') ? '- 実践的な手順と実装例' : ''}
${title.includes('Why') ? '- 技術選択の理由と利点' : ''}
${title.includes('How') ? '- 具体的な実装方法' : ''}
${title.includes('Top') || title.includes('Best') ? '- 厳選されたツールやライブラリ' : ''}
${title.includes('Fast') || title.includes('Performance') ? '- パフォーマンス改善の数値' : ''}
${title.includes('2025') || title.includes('2024') ? '- 最新トレンドや新機能' : ''}

重要な指示:
1. 必ず日本語で60-120文字の要約を生成
2. 具体的な技術名、手法、効果を含める
3. 「解説」「紹介」「説明」「記事」という単語は使わない
4. 動詞終止（〜する、〜できる）または体言止めで終える
5. タイトルの英単語から具体的内容を推測して含める
6. 数値があれば必ず含める（％、倍、件数など）
7. 読者が得られる具体的な知識や成果を明示
8. 詳細要約は必ず6項目以上、第1項目は「記事の主題は」で始める
        `.trim();
        
        console.error('  🔄 要約を生成中...');
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          content
        );
        
        // 要約をクリーンアップ
        let cleanedSummary = result.summary
          .replace(/^\s*要約[:：]\s*/gi, '')
          .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
          .replace(/\*\*/g, '')
          .replace(/##\s*/g, '')
          .replace(/```/g, '')
          .replace(/を解説.*$/g, '')
          .replace(/を紹介.*$/g, '')
          .replace(/について説明.*$/g, '')
          .replace(/する記事.*$/g, '')
          .replace(/した記事.*$/g, '')
          .replace(/です。?$/g, '')
          .replace(/。。$/g, '。')
          .trim();
        
        // 文末調整
        if (!cleanedSummary.endsWith('。') && 
            !cleanedSummary.endsWith('る') && 
            !cleanedSummary.endsWith('た') &&
            !cleanedSummary.endsWith('法') &&
            !cleanedSummary.endsWith('術') &&
            !cleanedSummary.endsWith('化')) {
          cleanedSummary += '。';
        }
        
        const cleanedDetailedSummary = result.detailedSummary
          .replace(/\*\*/g, '')
          .replace(/##\s*/g, '')
          .replace(/```/g, '')
          .trim();
        
        // 品質チェック
        const newJapaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const isJapanese = cleanedSummary.length > 0 && newJapaneseChars / cleanedSummary.length > 0.5;
        const hasGoodLength = cleanedSummary.length >= 60 && cleanedSummary.length <= 130;
        const notGeneric = !cleanedSummary.includes('解説') && 
                          !cleanedSummary.includes('紹介') && 
                          !cleanedSummary.includes('説明') &&
                          !cleanedSummary.includes('する記事') &&
                          !cleanedSummary.includes('した記事');
        
        const detailLines = cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        const hasProperTechnicalBackground = detailLines.length > 0 && detailLines[0].includes('記事の主題は');
        const hasEnoughItems = detailLines.length >= 6;
        
        if (isJapanese && hasGoodLength && notGeneric && hasProperTechnicalBackground && hasEnoughItems) {
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
            where: { id: article.id },
            data: {
              summary: cleanedSummary,
              detailedSummary: cleanedDetailedSummary,
              tags: { set: tagConnections },
              updatedAt: new Date()
            }
          });
          
          console.error(`  ✅ 成功: ${cleanedSummary.substring(0, 60)}...`);
          successCount++;
        } else {
          const problems = [];
          if (!isJapanese) problems.push('日本語化失敗');
          if (!hasGoodLength) problems.push(`長さ${cleanedSummary.length}文字`);
          if (!notGeneric) problems.push('一般的');
          if (!hasProperTechnicalBackground) problems.push('背景なし');
          if (!hasEnoughItems) problems.push(`項目${detailLines.length}`);
          console.error(`  ⚠️ 失敗: ${problems.join(', ')}`);
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`  ❌ エラー: ${error.message?.substring(0, 50) || error}`);
        errorCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.error('\n' + '='.repeat(60));
    console.error('🎉 処理完了');
    console.error(`✅ 成功: ${successCount}件`);
    console.error(`⏭️ スキップ: ${skipCount}件`);
    console.error(`❌ エラー: ${errorCount}件`);
    console.error(`⏱️ 総処理時間: ${Math.floor(totalTime/60)}分${totalTime%60}秒`);
    console.error(`🚀 処理速度: ${((successCount + skipCount) / (totalTime / 60)).toFixed(1)}件/分`);
    console.error(`📈 成功率: ${(successCount / (successCount + errorCount) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllDevto().catch(console.error);