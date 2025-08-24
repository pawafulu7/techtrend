#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixDevtoSummaries() {
  console.error('🔧 Dev.to記事の要約を改善\n');
  
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
    
    // 問題のある記事を特定
    const needsFix = [];
    
    for (const article of articles) {
      const issues = [];
      const s = article.summary || '';
      
      // 問題の検出
      if (s.length < 60) issues.push('短すぎ');
      if (s.length > 130) issues.push('長すぎ');
      
      const japaneseChars = (s.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
      const japaneseRatio = s.length > 0 ? japaneseChars / s.length : 0;
      if (japaneseRatio < 0.5) issues.push('英語混在');
      
      if (s.includes('解説') || s.includes('紹介') || s.includes('説明')) issues.push('一般的');
      if (s.includes('する記事') || s.includes('した記事') || s.includes('です。')) issues.push('記事言及');
      
      if (issues.length > 0) {
        needsFix.push({
          ...article,
          issues: issues
        });
      }
    }
    
    console.error(`修正が必要な記事: ${needsFix.length}件\n`);
    
    if (needsFix.length === 0) {
      console.error('✅ 修正が必要な記事はありません');
      return;
    }
    
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
    let errorCount = 0;
    const startTime = Date.now();
    
    // 最初の30件のみ処理（テスト的に）
    const processLimit = Math.min(30, needsFix.length);
    
    for (let i = 0; i < processLimit; i++) {
      const article = needsFix[i];
      console.error(`[${i + 1}/${processLimit}] 処理中: ${article.id}`);
      console.error(`  📝 ${article.title?.substring(0, 50)}...`);
      console.error(`  現在: ${article.summary?.substring(0, 80)}...`);
      console.error(`  問題: ${article.issues.join(', ')}`);
      
      try {
        // コンテンツを準備（Dev.to記事の特性を考慮）
        const content = `
Title: ${article.title}
URL: ${article.url}
Source: Dev.to

Article Content (limited):
${article.content?.substring(0, 1500) || 'Content not available'}

Context for Dev.to articles:
Dev.toは開発者向けのコミュニティプラットフォーム。技術記事、チュートリアル、意見記事、
プロジェクト紹介などが投稿される。記事は実践的で、コード例や具体的な手法を含むことが多い。

重要な指示（Dev.to専用）:
1. 一覧要約は必ず日本語で60-120文字、記事の具体的な価値を明確に示す
2. 「解説」「紹介」「説明」「する記事」「した記事」「です」という表現は絶対に使わない
3. 具体的な技術、手法、結果、数値を優先的に含める
4. 読者が得られる具体的な知識やスキルを明示する
5. タイトルから推測できる具体的な内容を積極的に活用する
6. 動詞で終わる（例：実装する、向上させる、解決する）か、体言止めにする
7. 詳細要約の第1項目は必ず「記事の主題は」で始める

タイトルからの推測：
${article.title?.includes('Build') ? '- 具体的な構築手順とアーキテクチャ' : ''}
${article.title?.includes('Guide') ? '- ステップバイステップの実装ガイド' : ''}
${article.title?.includes('vs') || article.title?.includes('Comparison') ? '- 複数の選択肢の比較と推奨' : ''}
${article.title?.includes('How to') || article.title?.includes('Tutorial') ? '- 実践的なチュートリアル' : ''}
${article.title?.includes('Why') ? '- 技術選択の理由と根拠' : ''}
${article.title?.includes('Performance') || article.title?.includes('Fast') ? '- パフォーマンス改善の具体的数値' : ''}
${article.title?.includes('AI') || article.title?.includes('LLM') || article.title?.includes('GPT') ? '- AI/LLMの活用方法と実装' : ''}
        `.trim();
        
        console.error('  🔄 要約を再生成中...');
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          content
        );
        
        // 要約を徹底的にクリーンアップ
        let cleanedSummary = result.summary
          .replace(/^\s*要約[:：]\s*/gi, '')
          .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
          .replace(/\*\*/g, '')
          .replace(/##\s*/g, '')
          .replace(/```/g, '')
          .replace(/を解説する.*$/g, '')
          .replace(/を紹介する.*$/g, '')
          .replace(/について説明.*$/g, '')
          .replace(/する記事.*$/g, '')
          .replace(/した記事.*$/g, '')
          .replace(/です。?$/g, '')
          .replace(/。。$/g, '。')
          .trim();
        
        // 文末を調整
        if (!cleanedSummary.endsWith('。') && 
            !cleanedSummary.endsWith('る') && 
            !cleanedSummary.endsWith('た') &&
            !cleanedSummary.endsWith('法') &&
            !cleanedSummary.endsWith('術')) {
          cleanedSummary += '。';
        }
        
        const cleanedDetailedSummary = result.detailedSummary
          .replace(/\*\*/g, '')
          .replace(/##\s*/g, '')
          .replace(/```/g, '')
          .trim();
        
        console.error(`  新要約: ${cleanedSummary.substring(0, 80)}...`);
        
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
          
          console.error('  ✅ 修正成功');
          successCount++;
        } else {
          const problems = [];
          if (!isJapanese) problems.push('日本語化失敗');
          if (!hasGoodLength) problems.push(`長さ不適切(${cleanedSummary.length}文字)`);
          if (!notGeneric) problems.push('まだ一般的');
          if (!hasProperTechnicalBackground) problems.push('技術的背景なし');
          if (!hasEnoughItems) problems.push('項目数不足');
          console.error(`  ⚠️ 品質チェック失敗: ${problems.join(', ')}`);
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`  ❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.error('\n' + '='.repeat(60));
    console.error('🎉 処理完了');
    console.error(`✅ 成功: ${successCount}件`);
    console.error(`❌ エラー: ${errorCount}件`);
    console.error(`⏱️ 処理時間: ${Math.floor(totalTime/60)}分${totalTime%60}秒`);
    console.error(`🚀 処理速度: ${(successCount / (totalTime / 60)).toFixed(1)}件/分`);
    
    if (needsFix.length > processLimit) {
      console.error(`\n📌 残り${needsFix.length - processLimit}件の記事があります`);
    }
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDevtoSummaries().catch(console.error);