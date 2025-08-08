#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixAllInsufficientSummaries() {
  console.log('🚀 要約情報が不足している全記事を修正\n');
  
  try {
    // すべての記事を取得
    const allArticles = await prisma.article.findMany({
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
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`全記事数: ${allArticles.length}件\n`);
    
    // 修正が必要な記事を検出
    const needsFix = [];
    
    for (const article of allArticles) {
      const issues = [];
      let severity = 0; // 重要度（高いほど優先）
      
      // 1. 要約が完全に欠落
      if (!article.summary || article.summary.trim() === '') {
        issues.push('要約なし');
        severity = 10;
      } else {
        // 要約の品質チェック
        const summary = article.summary.trim();
        
        // 短すぎる要約（20文字未満）
        if (summary.length < 20) {
          issues.push('要約短すぎ');
          severity = Math.max(severity, 8);
        }
        
        // 不明瞭な内容
        if (summary.includes('不明') || 
            summary.includes('記載なし') ||
            summary.includes('情報なし') ||
            summary.includes('undefined') ||
            summary.includes('null') ||
            summary.includes('N/A') ||
            summary === '.' ||
            summary === '...') {
          issues.push('要約不明瞭');
          severity = Math.max(severity, 9);
        }
        
        // プレフィックスやMarkdown
        if (summary.match(/^\\s*要約[:：]/i) || 
            summary.includes('**') ||
            summary.includes('##')) {
          issues.push('フォーマット問題');
          severity = Math.max(severity, 5);
        }
        
        // 英語要約（日本語が20%未満）
        const japaneseChars = (summary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const totalChars = summary.length;
        if (totalChars > 10 && japaneseChars / totalChars < 0.2) {
          issues.push('英語要約');
          severity = Math.max(severity, 7);
        }
      }
      
      // 2. 詳細要約が完全に欠落
      if (!article.detailedSummary || article.detailedSummary.trim() === '') {
        issues.push('詳細要約なし');
        severity = Math.max(severity, 10);
      } else {
        const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        
        // 項目数が極端に少ない（3未満）
        if (lines.length < 3) {
          issues.push('詳細要約極少');
          severity = Math.max(severity, 9);
        } else if (lines.length < 6) {
          issues.push('詳細要約不足');
          severity = Math.max(severity, 6);
        }
        
        // 技術的背景なし
        if (lines.length > 0 && !lines[0].includes('記事の主題は')) {
          issues.push('技術的背景なし');
          severity = Math.max(severity, 4);
        }
      }
      
      if (issues.length > 0) {
        needsFix.push({
          id: article.id,
          title: article.title,
          content: article.content,
          url: article.url,
          source: article.source,
          issues: issues,
          severity: severity,
          currentSummary: article.summary,
          currentDetailedSummary: article.detailedSummary
        });
      }
    }
    
    // 重要度順にソート（高い順）
    needsFix.sort((a, b) => b.severity - a.severity);
    
    console.log(`修正が必要な記事: ${needsFix.length}件\n`);
    
    // 問題別の統計
    const issueStats = {};
    needsFix.forEach(article => {
      article.issues.forEach(issue => {
        issueStats[issue] = (issueStats[issue] || 0) + 1;
      });
    });
    
    console.log('問題の内訳:');
    Object.entries(issueStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([issue, count]) => {
        console.log(`  - ${issue}: ${count}件`);
      });
    console.log();
    
    // 重要度別の統計
    const severityStats = {};
    needsFix.forEach(article => {
      const sev = `重要度${article.severity}`;
      severityStats[sev] = (severityStats[sev] || 0) + 1;
    });
    
    console.log('重要度別:');
    Object.entries(severityStats)
      .sort((a, b) => parseInt(b[0].replace('重要度', '')) - parseInt(a[0].replace('重要度', '')))
      .forEach(([sev, count]) => {
        console.log(`  - ${sev}: ${count}件`);
      });
    console.log();
    
    if (needsFix.length === 0) {
      console.log('✅ 修正が必要な記事はありません');
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
    console.log('✅ ローカルLLMサーバー接続成功\n');
    
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
        console.log(`\n📊 進捗: ${i}/${needsFix.length} (${Math.round(i/needsFix.length*100)}%)`);
        console.log(`✅ 成功: ${successCount}, ❌ エラー: ${errorCount}`);
        console.log(`⏱️ 経過: ${Math.floor(elapsed/60)}分${elapsed%60}秒`);
        console.log(`🚀 速度: ${rate.toFixed(1)}件/分`);
        console.log(`⏳ 推定残り: ${Math.round((needsFix.length - i) / rate)}分\n`);
      }
      
      console.log(`[${i + 1}/${needsFix.length}] 処理中: ${article.id}`);
      console.log(`  📝 ${article.title?.substring(0, 50)}...`);
      console.log(`  ⚠️ 問題: ${article.issues.join(', ')} (重要度: ${article.severity})`);
      
      try {
        // コンテンツを準備（要約生成に必要な情報を追加）
        let content = article.content || '';
        
        // コンテンツが極端に短い場合は情報を補強
        if (content.length < 100 || article.severity >= 8) {
          let additionalContext = '';
          
          // ソース別のコンテキスト追加
          if (article.source?.name === 'はてなブックマーク') {
            additionalContext = `
この記事は日本の技術コミュニティで話題になった記事です。
技術トレンド、開発手法、ツール、プログラミング言語、フレームワーク等が主なトピックです。
要約は必ず日本語で、技術的な内容を含めて生成してください。`;
          } else if (article.source?.name === 'Zenn') {
            additionalContext = `
この記事はZennの技術記事で、実践的な開発ノウハウやTipsが共有されています。
具体的なコード例、設定方法、トラブルシューティングなどが含まれます。
要約は必ず日本語で、実用的な情報を含めて生成してください。`;
          } else if (article.source?.name === 'Dev.to') {
            additionalContext = `
This is a technical article from Dev.to discussing software development.
Topics include programming languages, frameworks, tools, and best practices.
要約は必ず日本語で生成し、技術用語は適切に翻訳してください。`;
          } else if (article.source?.name === 'Qiita') {
            additionalContext = `
この記事はQiitaの技術記事で、日本のエンジニアによる実践的な知識共有です。
実装方法、問題解決のアプローチ、ベストプラクティスなどが含まれます。
要約は必ず日本語で、具体的な技術内容を含めて生成してください。`;
          } else if (article.source?.name === 'AWS') {
            additionalContext = `
これはAWSの公式情報です。新機能、サービス改善、技術仕様の変更などが含まれます。
要約は必ず日本語で生成し、AWSサービス名は英語のまま残してください。`;
          } else if (article.source?.name === 'Speaker Deck') {
            additionalContext = `
これは技術カンファレンスやミートアップで発表されたプレゼンテーション資料です。
技術的な概念、アーキテクチャ、実装パターン、ケーススタディなどが含まれます。
要約は必ず日本語で、発表の主要なポイントを含めて生成してください。`;
          } else {
            additionalContext = `
この記事は技術系の情報源からの記事です。
最新の技術動向、開発手法、ツール、サービスなどについて扱っています。
要約は必ず日本語で、技術的な内容を正確に含めて生成してください。`;
          }
          
          content = `
Title: ${article.title || 'タイトル不明'}
URL: ${article.url || ''}
Source: ${article.source?.name || '不明'}

Article Content:
${article.content || 'コンテンツが利用できません。タイトルとURLから内容を推測してください。'}

Context:
${additionalContext}

重要な指示:
1. 一覧要約は必ず日本語で60-120文字程度、技術的な内容を含める
2. 詳細要約は必ず6項目以上、第1項目は「記事の主題は」で始める
3. 不明な場合でも、タイトルとソースから推測して有益な要約を生成
4. プレフィックスやMarkdown記法は使用しない
5. 技術用語は適切に日本語化または説明を加える
          `.trim();
        }
        
        console.log('  🔄 要約を生成中...');
        
        const result = await localLLM.generateDetailedSummary(
          article.title || 'タイトル不明',
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
        
        // 品質チェック
        const japaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const totalChars = cleanedSummary.length;
        const isJapanese = totalChars > 0 && japaneseChars / totalChars > 0.3;
        const hasContent = cleanedSummary.length >= 20;
        
        // 詳細要約の確認
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        const hasProperTechnicalBackground = newLines.length > 0 && newLines[0].includes('記事の主題は');
        const hasEnoughItems = newLines.length >= 6;
        
        if (isJapanese && hasContent && hasProperTechnicalBackground && hasEnoughItems) {
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
          
          console.log('  ✅ 修正成功');
          successCount++;
        } else {
          const problems = [];
          if (!isJapanese) problems.push('日本語化失敗');
          if (!hasContent) problems.push('内容不足');
          if (!hasProperTechnicalBackground) problems.push('技術的背景なし');
          if (!hasEnoughItems) problems.push('項目数不足');
          console.log(`  ⚠️ 品質チェック失敗: ${problems.join(', ')}`);
          errorCount++;
        }
        
      } catch (error: any) {
        console.error(`  ❌ エラー: ${error.message || error}`);
        errorCount++;
      }
      
      // レート制限対策（重要度が高い記事は少し待機時間を短く）
      const waitTime = article.severity >= 8 ? 1000 : 1500;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.log('\n' + '='.repeat(60));
    console.log('🎉 処理完了');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ エラー: ${errorCount}件`);
    console.log(`⏱️ 総処理時間: ${Math.floor(totalTime/60)}分${totalTime%60}秒`);
    console.log(`🚀 平均処理速度: ${(successCount / (totalTime / 60)).toFixed(1)}件/分`);
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// エクスポート（直接実行も可能）
if (require.main === module) {
  fixAllInsufficientSummaries().catch(console.error);
}

export { fixAllInsufficientSummaries };