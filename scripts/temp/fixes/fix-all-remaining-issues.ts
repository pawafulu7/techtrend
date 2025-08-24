#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';
import { cleanSummary, cleanDetailedSummary } from '../lib/utils/summary-cleaner';

const prisma = new PrismaClient();

async function fixAllRemainingIssues() {
  console.error('🔧 すべての残存問題を完全修正\n');
  
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
    
    // すべての記事を取得
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
      take: 3000
    });
    
    // 問題のある記事を詳細に特定
    const problematicArticles = [];
    
    for (const article of articles) {
      const summary = article.summary || '';
      const detailedSummary = article.detailedSummary || '';
      const problems = [];
      
      // === 重大な問題 ===
      
      // 英語のまま（日本語率40%未満）
      if (summary.length > 20) {
        const japaneseChars = (summary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
        const ratio = japaneseChars / summary.length;
        if (ratio < 0.4) {
          problems.push('english_only');
        }
      }
      
      // 英語の思考過程
      if (summary.match(/\b(We need|Use article|Provide|Let me|I think|Therefore|However|So )\b/i)) {
        problems.push('english_thinking');
      }
      
      // コード断片
      if (summary.match(/\(\)|=>|function |const |let |var |\[\]/)) {
        problems.push('code_fragment');
      }
      
      // === 中程度の問題 ===
      
      // メタデータ混入
      if (summary.match(/要約[:：]|分析[:：]|詳細要約[:：]|tags?[:：]/i) ||
          summary.includes('Provide plausible details')) {
        problems.push('metadata');
      }
      
      // HTMLエンティティ
      if (summary.match(/&[a-z]+;/i)) {
        problems.push('html_entities');
      }
      
      // 記事内容の引用
      if (summary.includes('記事内容が「')) {
        problems.push('quote_as_summary');
      }
      
      // 文が途切れている
      if (summary.length > 30 && !summary.match(/[。！？）」]$/)) {
        problems.push('incomplete');
      }
      
      // === 軽微な問題 ===
      
      // 極端に短い
      const effectiveLength = summary.replace(/[。、！？\s]/g, '').length;
      if (effectiveLength > 0 && effectiveLength < 15) {
        problems.push('very_short');
      }
      
      // 重複句読点
      if (summary.match(/[。、]{2,}/)) {
        problems.push('duplicate_punct');
      }
      
      // 不自然なフォーマット
      if (summary.match(/\s{3,}|\n{2,}|^\s+|\s+$/)) {
        problems.push('strange_format');
      }
      
      // タイトル重複
      if (summary === article.title) {
        problems.push('title_dupe');
      }
      
      // 詳細要約の問題
      if (detailedSummary) {
        const items = detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        if (items.length > 0 && items.length < 4) {
          problems.push('insufficient_details');
        }
      }
      
      if (problems.length > 0) {
        problematicArticles.push({ ...article, problems });
      }
    }
    
    console.error(`📊 修正対象: ${problematicArticles.length}件\n`);
    
    // 問題の多い順にソート
    problematicArticles.sort((a, b) => {
      // 英語のままの記事を最優先
      const aEnglish = a.problems.includes('english_only') ? 1 : 0;
      const bEnglish = b.problems.includes('english_only') ? 1 : 0;
      if (aEnglish !== bEnglish) return bEnglish - aEnglish;
      
      // 問題数順
      return b.problems.length - a.problems.length;
    });
    
    let fixedCount = 0;
    let regeneratedCount = 0;
    let failedCount = 0;
    
    // すべての問題記事を処理（バッチ処理）
    const batchSize = 10;
    const totalBatches = Math.ceil(problematicArticles.length / batchSize);
    
    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * batchSize;
      const end = Math.min(start + batchSize, problematicArticles.length);
      const batchArticles = problematicArticles.slice(start, end);
      
      console.error(`\n📦 バッチ ${batch + 1}/${totalBatches} (${start + 1}-${end}件目)`);
      console.error('─'.repeat(60));
      
      for (const article of batchArticles) {
        const index = start + batchArticles.indexOf(article) + 1;
        console.error(`\n[${index}/${problematicArticles.length}] ${article.title.substring(0, 40)}...`);
        console.error(`   問題: ${article.problems.join(', ')}`);
        
        try {
          // 再生成が必要な条件
          const needsRegeneration = 
            article.problems.includes('english_only') ||
            article.problems.includes('english_thinking') ||
            article.problems.includes('quote_as_summary') ||
            article.problems.includes('insufficient_details') ||
            article.problems.includes('very_short') ||
            article.problems.length >= 3;
          
          if (needsRegeneration) {
            console.error('   🔄 再生成中...');
            
            // コンテンツを準備（英語記事の場合は翻訳指示を追加）
            let content = article.content || '';
            
            if (article.problems.includes('english_only')) {
              content = `
Title: ${article.title}
Source: ${article.source.name}
URL: ${article.url}

${content || article.title}

重要な指示:
1. この英語記事を日本語で要約してください
2. 60-120文字の自然な日本語で記載
3. 技術的な内容を正確に伝える
4. 具体的な技術やツール名は含める
5. 一般的な表現は避ける
              `.trim();
            } else if (!content || content.length < 100) {
              content = `
Title: ${article.title}
Source: ${article.source.name}
URL: ${article.url}

記事内容: ${content || article.title}

重要な指示:
1. タイトルと内容から技術記事の要約を作成
2. 60-120文字の日本語で具体的に記載
3. 技術的価値を明確に示す
4. 英語の思考過程は絶対に含めない
5. メタデータ（要約:等）は含めない
              `.trim();
            }
            
            const result = await localLLM.generateDetailedSummary(
              article.title,
              content
            );
            
            let cleanedSummary = cleanSummary(result.summary);
            let cleanedDetailedSummary = cleanDetailedSummary(result.detailedSummary);
            
            // 追加のクリーンアップ
            cleanedSummary = cleanedSummary
              .replace(/\b(We need|Use article|Provide|Let me)\b.*$/gi, '')
              .replace(/tags?[:：].*$/gi, '')
              .replace(/Provide plausible details\.?/gi, '')
              .trim();
            
            // 品質確認
            const japaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
            const isJapanese = cleanedSummary.length > 0 && japaneseChars / cleanedSummary.length > 0.5;
            
            if (isJapanese && cleanedSummary.length >= 60 && cleanedSummary.length <= 120) {
              await prisma.article.update({
                where: { id: article.id },
                data: {
                  summary: cleanedSummary,
                  detailedSummary: cleanedDetailedSummary,
                  updatedAt: new Date()
                }
              });
              
              console.error(`   ✅ 再生成成功`);
              regeneratedCount++;
            } else {
              console.error(`   ⚠️ 品質基準未達`);
              failedCount++;
            }
            
            // API制限対策
            await new Promise(resolve => setTimeout(resolve, 2000));
            
          } else {
            // クリーンアップのみ
            let fixedSummary = article.summary || '';
            let fixedDetailedSummary = article.detailedSummary || '';
            
            // メタデータ除去
            fixedSummary = fixedSummary
              .replace(/^.*?要約[:：]\s*/s, '')
              .replace(/^.*?分析[:：]\s*/s, '')
              .replace(/tags?[:：].*$/gi, '')
              .replace(/Provide plausible details\.?/gi, '');
            
            // HTMLエンティティデコード
            fixedSummary = fixedSummary
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");
            
            // 英語思考過程除去
            fixedSummary = fixedSummary
              .replace(/\b(We need|Use article|Provide|Let me|So )\b.*$/gi, '')
              .replace(/\. (Then|Therefore|However).*$/gi, '。');
            
            // コード断片除去
            fixedSummary = fixedSummary
              .replace(/\(\)/g, '')
              .replace(/\[\]/g, '')
              .replace(/=>/g, '→')
              .replace(/function |const |let |var /g, '');
            
            // 重複句読点修正
            fixedSummary = fixedSummary
              .replace(/[。]{2,}/g, '。')
              .replace(/[、]{2,}/g, '、');
            
            // 不要な空白除去
            fixedSummary = fixedSummary
              .replace(/\s{2,}/g, ' ')
              .replace(/^\s+|\s+$/g, '');
            
            // 標準クリーンアップ
            fixedSummary = cleanSummary(fixedSummary);
            
            // 文末処理
            if (!fixedSummary.match(/[。！？）」]$/)) {
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
      
      // バッチ間の待機
      if (batch < totalBatches - 1) {
        console.error('\n⏳ 次のバッチまで3秒待機...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // 最終結果
    console.error('\n' + '='.repeat(80));
    console.error('📊 完全修正結果:');
    console.error(`✅ クリーンアップ: ${fixedCount}件`);
    console.error(`🔄 再生成: ${regeneratedCount}件`);
    console.error(`❌ 失敗: ${failedCount}件`);
    console.error(`📈 合計処理: ${fixedCount + regeneratedCount + failedCount}件`);
    console.error(`🎯 成功率: ${Math.round((fixedCount + regeneratedCount) / (fixedCount + regeneratedCount + failedCount) * 100)}%`);
    
    if (failedCount === 0) {
      console.error('\n✨ 完璧！すべての問題が修正されました。');
    } else {
      console.error(`\n⚠️ ${failedCount}件の記事は手動確認が必要です。`);
    }
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllRemainingIssues().catch(console.error);