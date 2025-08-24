#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../../lib/ai/local-llm';
import { cleanSummary, cleanDetailedSummary } from '../../lib/utils/summary-cleaner';

const prisma = new PrismaClient();

async function fixAllDeepProblems() {
  console.error('🔧 深層チェックで検出された問題を一括修正\n');
  
  const localLLM = new LocalLLMClient({
    url: 'http://192.168.11.7:1234',
    model: 'openai/gpt-oss-20b',
    maxTokens: 3000,
    temperature: 0.3,
    maxContentLength: 12000
  });
  
  try {
    // 接続確認
    const connected = await localLLM.testConnection();
    if (!connected) {
      console.error('❌ ローカルLLMサーバーに接続できません');
      return;
    }
    console.error('✅ ローカルLLMサーバー接続成功\n');
    
    // 問題のある記事を取得
    const articles = await prisma.article.findMany({
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
        source: { select: { name: true } }
      },
      orderBy: { publishedAt: 'desc' },
      take: 2000
    });
    
    // 問題のある記事を特定
    const problematicArticles = [];
    
    for (const article of articles) {
      const summary = article.summary || '';
      const detailedSummary = article.detailedSummary || '';
      const problems = [];
      
      // HTMLエンティティ
      if (summary.includes('&amp;') || summary.includes('&lt;') || 
          summary.includes('&gt;') || summary.includes('&quot;')) {
        problems.push('html_entities');
      }
      
      // 英語の思考過程
      if (summary.match(/\b(Then|Let's|We need|So |Probably)\b/i)) {
        problems.push('english_thinking');
      }
      
      // メタデータ混入
      if (summary.includes('分析\n') || summary.includes('要約:') || 
          summary.includes('技術記事分析')) {
        problems.push('metadata');
      }
      
      // 記事内容の引用
      if (summary.includes('記事内容が「')) {
        problems.push('quote_as_summary');
      }
      
      // 文が途切れている
      if (summary.length > 20 && 
          !summary.endsWith('。') && 
          !summary.endsWith('）') && 
          !summary.endsWith('」')) {
        problems.push('incomplete');
      }
      
      // 重複句読点
      if (summary.includes('。。') || summary.includes('、、')) {
        problems.push('duplicate_punctuation');
      }
      
      // 英語のまま（日本語率30%未満）
      if (summary.length > 0) {
        const japaneseChars = (summary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const japaneseRatio = japaneseChars / summary.length;
        if (japaneseRatio < 0.3) {
          problems.push('english_only');
        }
      }
      
      // 詳細要約の項目不足
      if (detailedSummary) {
        const items = detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (items.length > 0 && items.length <= 3) {
          problems.push('insufficient_details');
        }
      }
      
      if (problems.length > 0) {
        problematicArticles.push({ ...article, problems });
      }
    }
    
    console.error(`📊 修正対象: ${problematicArticles.length}件\n`);
    
    // 優先順位付け（問題の多い記事を優先）
    problematicArticles.sort((a, b) => b.problems.length - a.problems.length);
    
    let fixedCount = 0;
    let regeneratedCount = 0;
    let failedCount = 0;
    
    // 最大30件まで処理
    const maxProcess = Math.min(30, problematicArticles.length);
    
    for (let i = 0; i < maxProcess; i++) {
      const article = problematicArticles[i];
      
      console.error(`\n[${i + 1}/${maxProcess}] 処理中: ${article.title.substring(0, 50)}...`);
      console.error(`   問題: ${article.problems.join(', ')}`);
      console.error(`   現在の要約: "${article.summary?.substring(0, 60)}..."`);
      
      try {
        // 再生成が必要かどうか判断
        const needsRegeneration = 
          article.problems.includes('english_only') ||
          article.problems.includes('quote_as_summary') ||
          article.problems.includes('insufficient_details') ||
          article.problems.length >= 3;
        
        if (needsRegeneration) {
          // 再生成
          console.error('   🔄 要約を再生成...');
          
          const content = article.content || `
タイトル: ${article.title}
ソース: ${article.source.name}
URL: ${article.url}

記事の内容を推測して要約を作成してください。
60-120文字の日本語で、具体的で価値のある要約を生成してください。
          `.trim();
          
          const result = await localLLM.generateDetailedSummary(
            article.title,
            content
          );
          
          const cleanedSummary = cleanSummary(result.summary);
          const cleanedDetailedSummary = cleanDetailedSummary(result.detailedSummary);
          
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: cleanedSummary,
              detailedSummary: cleanedDetailedSummary,
              updatedAt: new Date()
            }
          });
          
          console.error(`   ✅ 再生成完了: "${cleanedSummary.substring(0, 60)}..."`);
          regeneratedCount++;
          
          // API制限対策
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } else {
          // クリーンアップのみ
          let fixedSummary = article.summary || '';
          let fixedDetailedSummary = article.detailedSummary || '';
          
          // HTMLエンティティのデコード
          fixedSummary = fixedSummary
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ');
          
          // 英語の思考過程を除去
          fixedSummary = fixedSummary
            .replace(/\b(Then |Let's |We need |So |Probably |However |Therefore )/gi, '')
            .replace(/\. (Probably|So|Then|Let's).*$/gi, '。')
            .replace(/we can generalize.*$/gi, '')
            .replace(/detailed sections.*$/gi, '');
          
          // メタデータを除去
          fixedSummary = fixedSummary
            .replace(/^.*?分析\s*\n+\s*/s, '')
            .replace(/^.*?要約[:：]\s*/s, '')
            .replace(/^.*?技術記事分析\s*\n+\s*/s, '');
          
          // 重複句読点を修正
          fixedSummary = fixedSummary
            .replace(/。。+/g, '。')
            .replace(/、、+/g, '、')
            .replace(/。、/g, '。')
            .replace(/、。/g, '。');
          
          // 標準クリーンアップ
          fixedSummary = cleanSummary(fixedSummary);
          
          // 文末処理
          if (!fixedSummary.endsWith('。') && 
              !fixedSummary.endsWith('）') && 
              !fixedSummary.endsWith('」')) {
            fixedSummary += '。';
          }
          
          // 詳細要約もクリーンアップ
          if (fixedDetailedSummary) {
            fixedDetailedSummary = cleanDetailedSummary(fixedDetailedSummary);
          }
          
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: fixedSummary,
              detailedSummary: fixedDetailedSummary,
              updatedAt: new Date()
            }
          });
          
          console.error(`   ✅ クリーンアップ完了`);
          fixedCount++;
        }
        
      } catch (error) {
        console.error(`   ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
        failedCount++;
      }
    }
    
    // 結果サマリー
    console.error('\n' + '='.repeat(60));
    console.error('📊 修正完了サマリー:');
    console.error(`✅ クリーンアップ: ${fixedCount}件`);
    console.error(`🔄 再生成: ${regeneratedCount}件`);
    console.error(`❌ 失敗: ${failedCount}件`);
    console.error(`📈 合計処理: ${fixedCount + regeneratedCount + failedCount}件`);
    
    if (problematicArticles.length > maxProcess) {
      console.error(`\n⚠️ 残り ${problematicArticles.length - maxProcess}件の問題記事があります`);
      console.error('再度実行して残りを処理してください。');
    }
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllDeepProblems().catch(console.error);