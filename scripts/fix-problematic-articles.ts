#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixProblematicArticles() {
  const articleIds = [
    "cme187l5g000btezxz9x7o986",
    "cme161c5x000kte0trki33fk3"
  ];
  
  console.log('🤖 問題のある記事を品質を維持して修正\n');
  console.log(`処理対象: ${articleIds.length}件\n`);
  
  try {
    // ローカルLLMクライアントを初期化（品質重視の設定）
    const localLLM = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: 3000,  // トークン数を増やして完全な生成を保証
      temperature: 0.3,
      maxContentLength: 12000
    });
    
    // 接続確認
    const connected = await localLLM.testConnection();
    if (!connected) {
      console.error('❌ ローカルLLMサーバーに接続できません');
      return;
    }
    console.log('✅ ローカルLLMサーバー接続成功\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i];
      console.log(`\n[${i + 1}/${articleIds.length}] 処理中: ${articleId}`);
      console.log('='.repeat(60));
      
      try {
        // 記事を取得
        const article = await prisma.article.findUnique({
          where: { id: articleId },
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
        
        if (!article) {
          console.log('❌ 記事が見つかりません');
          errorCount++;
          continue;
        }
        
        console.log(`タイトル: ${article.title?.substring(0, 50)}...`);
        console.log(`ソース: ${article.source?.name}`);
        
        // 現在の状態を表示
        if (article.summary) {
          console.log(`\n現在の要約: ${article.summary.substring(0, 60)}...`);
          const currentIssues = [];
          if (article.summary.startsWith('要約:') || article.summary.startsWith(' 要約:')) {
            currentIssues.push('プレフィックス');
          }
          if (article.summary.includes('**')) {
            currentIssues.push('Markdown記法');
          }
          if (article.summary.length < 60) {
            currentIssues.push(`短い(${article.summary.length}文字)`);
          }
          if (currentIssues.length > 0) {
            console.log(`問題: ${currentIssues.join(', ')}`);
          }
        }
        
        if (article.detailedSummary) {
          const currentLines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
          console.log(`現在の詳細項目数: ${currentLines.length}`);
        }
        
        // コンテンツを構築（記事の内容をしっかり取得）
        let enhancedContent = article.content || '';
        
        // コンテンツが短い場合は、タイトルとURLから内容を推測して強化
        if (enhancedContent.length < 500) {
          // ソース別に適切なコンテキストを追加
          let additionalContext = '';
          
          if (article.source?.name === 'Dev.to') {
            additionalContext = `
This is a technical article from Dev.to platform. The article discusses modern software development practices, 
tools, and methodologies. It provides practical insights and implementation approaches for developers.
Topics may include AI/ML integration, cloud services, programming frameworks, or development workflows.`;
          } else if (article.source?.name === 'Corporate Tech Blog') {
            additionalContext = `
この記事は企業のテックブログからの記事で、実務での技術活用やビジネス課題の解決について解説しています。
データサイエンス、機械学習、AIの実装、組織での技術導入などの実践的な内容が含まれる可能性があります。`;
          }
          
          enhancedContent = `
Title: ${article.title}
URL: ${article.url}
Source: ${article.source?.name}

Article Content:
${article.content || ''}

Context:
${additionalContext}
          `.trim();
        }
        
        console.log(`コンテンツ長: ${enhancedContent.length}文字`);
        
        console.log('\n🔄 品質を重視して詳細要約を生成中...');
        console.log('（時間がかかる場合があります）');
        const startTime = Date.now();
        
        // 品質重視で生成
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          enhancedContent
        );
        
        const duration = Date.now() - startTime;
        console.log(`生成時間: ${duration}ms`);
        
        // 要約を徹底的にクリーンアップ
        let cleanedSummary = result.summary
          .replace(/^\s*要約[:：]\s*/gi, '')
          .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
          .replace(/\*\*/g, '')
          .replace(/##\s*/g, '')
          .replace(/^\s+|\s+$/g, '');
        
        // 文末処理
        if (cleanedSummary && !cleanedSummary.endsWith('。')) {
          cleanedSummary = cleanedSummary + '。';
        }
        
        // 詳細要約もクリーンアップ
        let cleanedDetailedSummary = result.detailedSummary;
        if (cleanedDetailedSummary) {
          const lines = cleanedDetailedSummary.split('\n');
          const cleanedLines = lines.map(line => {
            if (line.trim().startsWith('・')) {
              // プレフィックスとMarkdown記法を完全に除去
              return line
                .replace(/^\s*・\s*\*\*要約[:：]\*\*\s*/gi, '・')
                .replace(/^\s*・\s*要約[:：]\s*/gi, '・')
                .replace(/\*\*/g, '');
            }
            return line;
          });
          cleanedDetailedSummary = cleanedLines.join('\n');
        }
        
        // 品質チェック（柔軟な基準）
        const detailLines = cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        const summaryQuality = 
          cleanedSummary.length >= 45 && // 45文字以上でOK
          cleanedSummary.endsWith('。') &&
          !cleanedSummary.includes('要約:') &&
          !cleanedSummary.includes('要約：') &&
          !cleanedSummary.includes('**');
        
        console.log(`\n📝 生成結果:`);
        console.log(`要約: ${cleanedSummary.substring(0, 80)}...`);
        console.log(`要約長: ${cleanedSummary.length}文字`);
        console.log(`要約品質: ${summaryQuality ? '✅ 良好' : '⚠️ 要改善'}`);
        console.log(`詳細項目数: ${detailLines.length}`);
        console.log(`詳細品質: ${detailLines.length === 6 ? '✅ 完璧' : detailLines.length >= 5 ? '✅ 良好' : '⚠️ 不足'}`);
        
        // 5項目以上の詳細要約と適切な要約があれば更新
        if (detailLines.length >= 5 && summaryQuality) {
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
            where: { id: articleId },
            data: {
              summary: cleanedSummary,
              detailedSummary: cleanedDetailedSummary,
              tags: {
                set: tagConnections
              },
              updatedAt: new Date()
            }
          });
          
          console.log('✅ 更新完了');
          successCount++;
        } else {
          console.log('⚠️ 品質基準を満たさないためスキップ');
          console.log('  （要約45文字以上、詳細5項目以上が必要）');
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // レート制限対策（品質重視のため長めに設定）
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('処理完了');
    console.log(`成功: ${successCount}件`);
    console.log(`エラー: ${errorCount}件`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixProblematicArticles().catch(console.error);