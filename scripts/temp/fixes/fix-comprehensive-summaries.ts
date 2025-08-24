#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixComprehensiveSummaries() {
  console.error('🚀 包括的な要約修正（技術的背景＋要約品質改善）\n');
  
  try {
    // すべての記事を取得（要約があるもの）
    const allArticles = await prisma.article.findMany({
      where: {
        OR: [
          { summary: { not: null } },
          { detailedSummary: { not: null } }
        ]
      },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        summary: true,
        detailedSummary: true,
        source: { select: { name: true } },
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 2000
    });
    
    console.error(`全記事数: ${allArticles.length}件\n`);
    
    // 修正が必要な記事を分類
    const needsFix = [];
    
    for (const article of allArticles) {
      const issues = [];
      
      // 1. 技術的背景のチェック
      if (article.detailedSummary) {
        const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (lines.length > 0) {
          const firstLine = lines[0];
          if (!firstLine.includes('記事の主題は')) {
            issues.push('技術的背景なし');
          }
        }
        // 項目数が少ない
        if (lines.length < 6) {
          issues.push('詳細要約不足');
        }
      } else {
        issues.push('詳細要約なし');
      }
      
      // 2. 一覧要約の品質チェック
      if (article.summary) {
        // プレフィックスチェック
        if (article.summary.match(/^\\s*要約[:：]/i) || 
            article.summary.match(/^\\s*\\*\\*要約/i)) {
          issues.push('プレフィックスあり');
        }
        
        // Markdown記法チェック
        if (article.summary.includes('**') || 
            article.summary.includes('##') ||
            article.summary.includes('```')) {
          issues.push('Markdown記法');
        }
        
        // 英語要約チェック（日本語が20%未満）
        const japaneseChars = (article.summary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const totalChars = article.summary.length;
        if (totalChars > 20 && japaneseChars / totalChars < 0.2) {
          issues.push('英語要約');
        }
        
        // 不明瞭なチェック
        if (article.summary.includes('不明') || 
            article.summary.includes('記載なし') ||
            article.summary.includes('情報なし') ||
            article.summary.includes('undefined') ||
            article.summary.includes('null') ||
            article.summary.length < 30) {
          issues.push('不明瞭');
        }
        
        // 文章が完結していない
        if (!article.summary.endsWith('。') && 
            !article.summary.endsWith('）') && 
            !article.summary.endsWith('」')) {
          issues.push('文末不完全');
        }
      } else {
        issues.push('要約なし');
      }
      
      if (issues.length > 0) {
        needsFix.push({
          id: article.id,
          title: article.title,
          content: article.content,
          url: article.url,
          source: article.source,
          issues: issues,
          currentSummary: article.summary,
          currentDetailedSummary: article.detailedSummary
        });
      }
    }
    
    console.error(`修正が必要な記事: ${needsFix.length}件\n`);
    
    // 問題別の統計
    const issueStats = {};
    needsFix.forEach(article => {
      article.issues.forEach(issue => {
        issueStats[issue] = (issueStats[issue] || 0) + 1;
      });
    });
    
    console.error('問題の内訳:');
    Object.entries(issueStats).forEach(([issue, count]) => {
      console.error(`  - ${issue}: ${count}件`);
    });
    console.error();
    
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
    
    // すべての修正対象を処理
    for (let i = 0; i < needsFix.length; i++) {
      const article = needsFix[i];
      
      // 進捗表示（10件ごと）
      if (i % 10 === 0 && i > 0) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const rate = successCount / (elapsed / 60) || 0;
        console.error(`\n📊 進捗: ${i}/${needsFix.length} (${Math.round(i/needsFix.length*100)}%) - 成功: ${successCount}, エラー: ${errorCount}`);
        console.error(`⏱️ 経過時間: ${Math.floor(elapsed/60)}分${elapsed%60}秒 - 処理速度: ${rate.toFixed(1)}件/分`);
        console.error(`🔍 推定残り時間: ${Math.round((needsFix.length - i) / rate)}分\n`);
      }
      
      console.error(`[${i + 1}/${needsFix.length}] 処理中: ${article.id}`);
      console.error(`  問題: ${article.issues.join(', ')}`);
      
      try {
        // コンテンツを準備
        let content = article.content || '';
        if (content.length < 300) {
          // ソースごとに適切なコンテキストを追加
          let additionalContext = '';
          
          if (article.source?.name === 'はてなブックマーク') {
            additionalContext = `
この記事は日本の技術コミュニティで話題になった記事です。
最新の技術トレンド、開発手法、ツール、プログラミング言語、フレームワーク等について議論されています。
要約は必ず日本語で生成してください。`;
          } else if (article.source?.name === 'Zenn') {
            additionalContext = `
この記事はZennの技術記事で、実践的な開発ノウハウやTipsが共有されています。
具体的なコード例、設定方法、トラブルシューティングなどが含まれる可能性があります。
要約は必ず日本語で生成してください。`;
          } else if (article.source?.name === 'Dev.to') {
            additionalContext = `
This is a technical article from Dev.to platform discussing modern software development practices.
Topics may include programming languages, frameworks, tools, methodologies, and best practices.
要約は必ず日本語で生成してください。英語の技術用語は適切に日本語に翻訳してください。`;
          } else if (article.source?.name === 'Speaker Deck') {
            additionalContext = `
これは技術カンファレンスやミートアップで発表されたプレゼンテーション資料です。
技術的な概念、アーキテクチャ、実装パターン、ケーススタディなどが含まれます。
要約は必ず日本語で生成してください。`;
          } else if (article.source?.name === 'Qiita') {
            additionalContext = `
この記事はQiitaの技術記事で、日本のエンジニアによる実践的な知識共有です。
具体的な実装方法、問題解決のアプローチ、ベストプラクティスなどが含まれます。
要約は必ず日本語で生成してください。`;
          } else if (article.source?.name === 'AWS') {
            additionalContext = `
これはAWSの公式発表やアップデート情報です。
新機能、サービス改善、技術仕様の変更などが含まれます。
要約は必ず日本語で生成してください。AWSサービス名は英語のまま残してください。`;
          } else if (article.source?.name === 'Google AI Blog') {
            additionalContext = `
これはGoogleのAI研究に関する技術ブログです。
最新のAI研究、機械学習モデル、技術革新などが含まれます。
要約は必ず日本語で生成してください。`;
          } else {
            additionalContext = `
この記事は技術系の情報源からの記事です。
要約は必ず日本語で生成してください。`;
          }
          
          content = `
Title: ${article.title}
URL: ${article.url}
Source: ${article.source?.name}

Article Content:
${article.content || ''}

Context:
${additionalContext}

重要な指示:
1. 一覧要約は必ず日本語で、60-120文字程度で簡潔に
2. プレフィックス（「要約:」など）やMarkdown記法（**、##など）は使用しない
3. 詳細要約の第1項目は必ず「記事の主題は」で始める
4. 詳細要約は必ず6項目以上含める
          `.trim();
        }
        
        console.error('  🔄 要約を再生成中...');
        
        const result = await localLLM.generateDetailedSummary(
          article.title || '',
          content
        );
        
        // 要約をクリーンアップ
        let cleanedSummary = result.summary
          .replace(/^\\s*要約[:：]\\s*/gi, '')
          .replace(/^\\s*\\*\\*要約\\*\\*[:：]?\\s*/gi, '')
          .replace(/\\*\\*/g, '')
          .replace(/##\\s*/g, '')
          .replace(/```/g, '')
          .trim();
        
        // 要約の品質チェック
        const japaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const totalChars = cleanedSummary.length;
        const isJapanese = totalChars > 0 && japaneseChars / totalChars > 0.5;
        
        // 詳細要約の確認
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        const hasProperTechnicalBackground = newLines.length > 0 && newLines[0].includes('記事の主題は');
        const hasEnoughItems = newLines.length >= 6;
        
        if (isJapanese && hasProperTechnicalBackground && hasEnoughItems) {
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
              detailedSummary: result.detailedSummary,
              tags: { set: tagConnections },
              updatedAt: new Date()
            }
          });
          
          console.error('  ✅ 修正成功');
          successCount++;
        } else {
          const problems = [];
          if (!isJapanese) problems.push('日本語化失敗');
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
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.error('\n' + '='.repeat(60));
    console.error('🎉 処理完了');
    console.error(`成功: ${successCount}件`);
    console.error(`エラー: ${errorCount}件`);
    console.error(`総処理時間: ${Math.floor(totalTime/60)}分${totalTime%60}秒`);
    console.error(`平均処理速度: ${(successCount / (totalTime / 60)).toFixed(1)}件/分`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// エクスポート（直接実行も可能）
if (require.main === module) {
  fixComprehensiveSummaries().catch(console.error);
}

export { fixComprehensiveSummaries };