#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { cleanSummary, cleanDetailedSummary } from '../lib/utils/summary-cleaner';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

interface FixResult {
  id: string;
  title: string;
  status: 'fixed' | 'regenerated' | 'failed';
  reason?: string;
}

async function fixAllInvalidSummaries() {
  console.error('🔧 不正な要約を一括修正\n');
  
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
      take: 500
    });
    
    const results: FixResult[] = [];
    let fixedCount = 0;
    let regeneratedCount = 0;
    let failedCount = 0;
    
    console.error(`📊 処理対象: ${articles.length}件\n`);
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const problems: string[] = [];
      let needsRegeneration = false;
      
      // 問題のパターンをチェック
      if (article.summary) {
        // 改行を含む場合
        if (article.summary.includes('\n')) {
          problems.push('改行含む');
          
          // "分析\n\n要約:" パターンを検出
          if (article.summary.includes('分析\n') || article.summary.includes('要約:')) {
            needsRegeneration = true;
          }
        }
        
        // 冒頭コロン
        if (article.summary.startsWith(':')) {
          problems.push('冒頭コロン');
        }
        
        // 長すぎる
        if (article.summary.length > 150) {
          problems.push('長すぎ');
        }
        
        // 途切れ
        if (article.summary.endsWith('...') || 
            !article.summary.match(/[。.!?）」]$/)) {
          problems.push('途切れ');
        }
        
        // 生成失敗パターン
        if (article.summary.includes('仮に記事内容が') || 
            article.summary.includes('仮定して')) {
          problems.push('生成失敗');
          needsRegeneration = true;
        }
      }
      
      // 問題がない場合はスキップ
      if (problems.length === 0) {
        continue;
      }
      
      // 進捗表示
      if ((i + 1) % 10 === 0) {
        console.error(`処理中: ${i + 1}/${articles.length}`);
      }
      
      try {
        if (needsRegeneration || problems.includes('生成失敗')) {
          // 再生成が必要な場合
          console.error(`\n🔄 再生成: ${article.title.substring(0, 50)}...`);
          console.error(`   問題: ${problems.join(', ')}`);
          
          const content = article.content || article.title;
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
          
          results.push({
            id: article.id,
            title: article.title.substring(0, 50),
            status: 'regenerated'
          });
          regeneratedCount++;
          
          // API制限対策
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } else {
          // クリーンアップのみで修正可能な場合
          let fixedSummary = article.summary || '';
          
          // "分析\n\n要約:" パターンを除去
          fixedSummary = fixedSummary
            .replace(/^.*?分析\s*\n+\s*要約[:：]\s*/s, '')
            .replace(/^.*?技術記事分析\s*\n+\s*要約[:：]\s*/s, '')
            .replace(/^.*?に関する分析\s*\n+\s*要約[:：]\s*/s, '');
          
          // 改行を除去
          fixedSummary = fixedSummary.replace(/\n/g, ' ');
          
          // 冒頭コロンを除去
          if (fixedSummary.startsWith(':')) {
            fixedSummary = fixedSummary.substring(1);
          }
          
          // 標準クリーンアップ
          fixedSummary = cleanSummary(fixedSummary);
          
          // 長すぎる場合は切り詰め
          if (fixedSummary.length > 120) {
            // 文の区切りで切る
            const sentences = fixedSummary.match(/[^。！？]+[。！？]/g) || [];
            let truncated = '';
            for (const sentence of sentences) {
              if (truncated.length + sentence.length <= 120) {
                truncated += sentence;
              } else {
                break;
              }
            }
            if (truncated) {
              fixedSummary = truncated;
            } else {
              fixedSummary = fixedSummary.substring(0, 117) + '...';
            }
          }
          
          // 詳細要約もクリーンアップ
          let fixedDetailedSummary = article.detailedSummary || '';
          if (fixedDetailedSummary) {
            fixedDetailedSummary = cleanDetailedSummary(fixedDetailedSummary);
          }
          
          // 更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: fixedSummary,
              detailedSummary: fixedDetailedSummary,
              updatedAt: new Date()
            }
          });
          
          results.push({
            id: article.id,
            title: article.title.substring(0, 50),
            status: 'fixed',
            reason: problems.join(', ')
          });
          fixedCount++;
        }
        
      } catch (error) {
        console.error(`❌ エラー (${article.id}):`, error);
        results.push({
          id: article.id,
          title: article.title.substring(0, 50),
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error)
        });
        failedCount++;
      }
    }
    
    // 結果サマリー
    console.error('\n' + '='.repeat(60));
    console.error('📊 修正完了サマリー:');
    console.error(`✅ クリーンアップ修正: ${fixedCount}件`);
    console.error(`🔄 再生成: ${regeneratedCount}件`);
    console.error(`❌ 失敗: ${failedCount}件`);
    console.error(`📈 合計処理: ${fixedCount + regeneratedCount + failedCount}件`);
    
    // 失敗した記事のリスト
    const failed = results.filter(r => r.status === 'failed');
    if (failed.length > 0) {
      console.error('\n⚠️ 修正に失敗した記事:');
      for (const f of failed) {
        console.error(`- ${f.title}: ${f.reason}`);
      }
    }
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
fixAllInvalidSummaries().catch(console.error);