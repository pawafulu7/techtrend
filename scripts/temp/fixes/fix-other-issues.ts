#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { cleanSummary, cleanDetailedSummary } from '../../lib/utils/summary-cleaner';

const prisma = new PrismaClient();

async function fixOtherIssues() {
  console.error('🔧 その他の問題（不完全な文、短すぎる要約等）を修正\n');
  
  try {
    // 問題のある記事を取得
    const articles = await prisma.article.findMany({
      where: {
        summary: { not: null }
      },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        source: { select: { name: true } }
      },
      orderBy: { publishedAt: 'desc' },
      take: 2000
    });
    
    let fixedCount = 0;
    const problems = [];
    
    for (const article of articles) {
      let summary = article.summary || '';
      let detailedSummary = article.detailedSummary || '';
      let needsUpdate = false;
      const originalSummary = summary;
      const articleProblems = [];
      
      // 1. 極端に短い要約（実質15文字未満）
      const effectiveLength = summary.replace(/[。、！？\s]/g, '').length;
      if (effectiveLength > 0 && effectiveLength < 15) {
        articleProblems.push('very_short');
        // タイトルから補完
        if (article.title.length > 30) {
          summary = article.title.substring(0, 80) + 'に関する技術的解説と実装方法。';
        } else {
          summary = article.title + 'について詳しく解説し、実践的な活用方法を提示。';
        }
        needsUpdate = true;
      }
      
      // 2. 文が途切れている（句点なしで終了）
      if (summary.length > 30 && !summary.match(/[。！？）」]$/)) {
        articleProblems.push('incomplete');
        // 適切な文末を追加
        if (summary.endsWith('を')) {
          summary += '解説。';
        } else if (summary.endsWith('で')) {
          summary += '実現。';
        } else if (summary.endsWith('と')) {
          summary += 'その活用法。';
        } else if (summary.endsWith('の')) {
          summary += '実装方法と活用例';
        } else {
          summary += '。';
        }
        needsUpdate = true;
      }
      
      // 3. 重複句読点
      if (summary.match(/[。、]{2,}/)) {
        articleProblems.push('duplicate_punct');
        summary = summary
          .replace(/。+/g, '。')
          .replace(/、+/g, '、')
          .replace(/。、/g, '。')
          .replace(/、。/g, '。');
        needsUpdate = true;
      }
      
      // 4. 不自然な空白
      if (summary.match(/\s{2,}|^\s+|\s+$/)) {
        articleProblems.push('strange_format');
        summary = summary
          .replace(/\s+/g, ' ')
          .replace(/^\s+|\s+$/g, '');
        needsUpdate = true;
      }
      
      // 5. 単なる「。」だけの要約
      if (summary === '。' || summary === '、' || summary.match(/^[。、\s]+$/)) {
        articleProblems.push('punctuation_only');
        summary = article.title.substring(0, 80) + 'の詳細解説。';
        needsUpdate = true;
      }
      
      // 6. タイトルと完全一致
      if (summary === article.title) {
        articleProblems.push('title_dupe');
        summary = article.title + 'の技術的背景と実装方法を詳しく解説。';
        needsUpdate = true;
      }
      
      // 7. 英語の思考過程除去（簡易版）
      if (summary.includes('Use ') || summary.includes('Provide ')) {
        articleProblems.push('english_thinking');
        summary = summary
          .replace(/\bUse .*$/gi, '')
          .replace(/\bProvide .*$/gi, '')
          .replace(/\bWe need .*$/gi, '')
          .replace(/\bLet's .*$/gi, '')
          .replace(/\bThen .*$/gi, '')
          .trim();
        
        // 短くなりすぎた場合は補完
        if (summary.length < 40) {
          summary = article.title.substring(0, 60) + 'の実装と活用。';
        }
        needsUpdate = true;
      }
      
      // 8. コード断片の除去
      if (summary.includes('()') || summary.includes('[]')) {
        articleProblems.push('code_fragment');
        summary = summary
          .replace(/\(\)/g, '')
          .replace(/\[\]/g, '')
          .replace(/function /g, '')
          .replace(/const /g, '')
          .replace(/let /g, '')
          .replace(/var /g, '')
          .replace(/=>/g, '→')
          .trim();
        needsUpdate = true;
      }
      
      // 9. 標準クリーンアップ
      if (needsUpdate) {
        summary = cleanSummary(summary);
        
        // 詳細要約もクリーンアップ
        if (detailedSummary) {
          detailedSummary = cleanDetailedSummary(detailedSummary);
        }
        
        // 更新
        try {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: summary,
              detailedSummary: detailedSummary,
              updatedAt: new Date()
            }
          });
          
          fixedCount++;
          problems.push({
            id: article.id,
            title: article.title.substring(0, 50),
            problems: articleProblems,
            before: originalSummary,
            after: summary
          });
          
          if (fixedCount % 10 === 0) {
            console.error(`✅ ${fixedCount}件修正完了`);
          }
        } catch (error) {
          console.error(`❌ 更新エラー (${article.id}):`, error);
        }
      }
    }
    
    // 結果表示
    console.error('\n' + '='.repeat(60));
    console.error('📊 修正完了サマリー:');
    console.error(`✅ 修正された記事: ${fixedCount}件`);
    
    if (problems.length > 0) {
      console.error('\n修正例（最初の5件）:');
      for (let i = 0; i < Math.min(5, problems.length); i++) {
        const p = problems[i];
        console.error(`\n${i + 1}. ${p.title}...`);
        console.error(`   問題: ${p.problems.join(', ')}`);
        console.error(`   修正前: "${p.before.substring(0, 60)}..."`);
        console.error(`   修正後: "${p.after.substring(0, 60)}..."`);
      }
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixOtherIssues().catch(console.error);