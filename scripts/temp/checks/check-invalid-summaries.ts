#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { checkSummaryQuality, checkDetailedSummaryQuality } from '../../lib/utils/summary-cleaner';

const prisma = new PrismaClient();

interface ProblematicArticle {
  id: string;
  title: string;
  source: string;
  summary: string | null;
  detailedSummary: string | null;
  problems: string[];
}

async function checkInvalidSummaries() {
  console.error('🔍 不正な要約パターンをチェック中...\n');
  
  try {
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
        summary: true,
        detailedSummary: true,
        source: { select: { name: true } }
      },
      orderBy: { publishedAt: 'desc' },
      take: 500 // 最新500件をチェック
    });
    
    console.error(`📊 チェック対象: ${articles.length}件\n`);
    
    const problematicArticles: ProblematicArticle[] = [];
    
    // 特殊な問題パターンのカウンター
    const specialProblems = {
      colonStart: 0,      // 冒頭コロン
      multiLine: 0,       // 改行含む
      tooLong: 0,         // 120文字超
      tooShort: 0,        // 20文字未満
      englishMixed: 0,    // 英語混在
      truncated: 0,       // 途切れ
      markdown: 0,        // Markdown記法
      genericPhrase: 0,   // 一般的表現
      noTechnicalBg: 0,   // 技術的背景なし
      emptyOrInvalid: 0   // 空または無効
    };
    
    for (const article of articles) {
      const problems: string[] = [];
      
      // 一覧要約のチェック
      if (article.summary) {
        const summary = article.summary;
        
        // 特殊パターンのチェック
        if (summary.startsWith(':')) {
          problems.push('冒頭コロン');
          specialProblems.colonStart++;
        }
        
        if (summary.includes('\n')) {
          problems.push('改行含む');
          specialProblems.multiLine++;
        }
        
        if (summary.length > 150) {
          problems.push(`長すぎ(${summary.length}文字)`);
          specialProblems.tooLong++;
        }
        
        if (summary.length < 20) {
          problems.push(`短すぎ(${summary.length}文字)`);
          specialProblems.tooShort++;
        }
        
        // 途切れチェック
        if (summary.endsWith('...') || 
            (summary.length === 200 || summary.length === 203) ||
            (!summary.endsWith('。') && !summary.endsWith('）') && !summary.endsWith('」'))) {
          problems.push('途切れ');
          specialProblems.truncated++;
        }
        
        // 標準的な品質チェック
        const qualityCheck = checkSummaryQuality(summary);
        if (!qualityCheck.isValid) {
          qualityCheck.issues.forEach(issue => {
            if (issue === 'Markdown記法') specialProblems.markdown++;
            if (issue === '一般的表現') specialProblems.genericPhrase++;
            if (issue === '英語混在（日本語<30%）') specialProblems.englishMixed++;
          });
          problems.push(...qualityCheck.issues);
        }
        
      } else {
        problems.push('要約なし');
        specialProblems.emptyOrInvalid++;
      }
      
      // 詳細要約のチェック
      if (article.detailedSummary) {
        const detailedQuality = checkDetailedSummaryQuality(article.detailedSummary);
        if (!detailedQuality.isValid) {
          detailedQuality.issues.forEach(issue => {
            if (issue === '技術的背景なし') {
              problems.push('詳細:技術的背景なし');
              specialProblems.noTechnicalBg++;
            } else if (issue === 'Markdown記法') {
              problems.push('詳細:Markdown');
              specialProblems.markdown++;
            } else {
              problems.push(`詳細:${issue}`);
            }
          });
        }
        
        // 冒頭コロンチェック（詳細要約）
        if (article.detailedSummary.startsWith(':')) {
          problems.push('詳細:冒頭コロン');
          specialProblems.colonStart++;
        }
      } else {
        problems.push('詳細要約なし');
        specialProblems.emptyOrInvalid++;
      }
      
      // 問題がある場合は記録
      if (problems.length > 0) {
        problematicArticles.push({
          id: article.id,
          title: article.title.substring(0, 60) + (article.title.length > 60 ? '...' : ''),
          source: article.source.name,
          summary: article.summary,
          detailedSummary: article.detailedSummary,
          problems
        });
      }
    }
    
    // 結果表示
    console.error('📈 問題パターン統計:');
    console.error('─'.repeat(60));
    console.error(`冒頭コロン: ${specialProblems.colonStart}件`);
    console.error(`改行含む: ${specialProblems.multiLine}件`);
    console.error(`長すぎ(>150文字): ${specialProblems.tooLong}件`);
    console.error(`短すぎ(<20文字): ${specialProblems.tooShort}件`);
    console.error(`英語混在: ${specialProblems.englishMixed}件`);
    console.error(`途切れ: ${specialProblems.truncated}件`);
    console.error(`Markdown記法: ${specialProblems.markdown}件`);
    console.error(`一般的表現: ${specialProblems.genericPhrase}件`);
    console.error(`技術的背景なし: ${specialProblems.noTechnicalBg}件`);
    console.error(`空/無効: ${specialProblems.emptyOrInvalid}件`);
    console.error('─'.repeat(60));
    console.error(`問題のある記事総数: ${problematicArticles.length}件 / ${articles.length}件`);
    console.error(`問題率: ${(problematicArticles.length / articles.length * 100).toFixed(1)}%\n`);
    
    // 特に問題の多い記事を表示（冒頭コロン、改行、途切れを優先）
    const criticalProblems = problematicArticles
      .filter(a => 
        a.problems.some(p => 
          p === '冒頭コロン' || 
          p === '改行含む' || 
          p === '途切れ' ||
          p === '詳細:冒頭コロン'
        )
      )
      .slice(0, 10);
    
    if (criticalProblems.length > 0) {
      console.error('⚠️  特に修正が必要な記事（最大10件）:');
      console.error('─'.repeat(60));
      
      for (const article of criticalProblems) {
        console.error(`\n📄 ${article.title}`);
        console.error(`   ID: ${article.id}`);
        console.error(`   ソース: ${article.source}`);
        console.error(`   問題: ${article.problems.join(', ')}`);
        
        if (article.summary && (article.problems.includes('冒頭コロン') || article.problems.includes('改行含む'))) {
          const preview = article.summary.substring(0, 100).replace(/\n/g, '\\n');
          console.error(`   要約冒頭: "${preview}..."`);
        }
      }
    }
    
    // 修正スクリプトの提案
    if (problematicArticles.length > 0) {
      console.error('\n💡 修正方法:');
      console.error('1. 個別修正: npx tsx scripts/fix-o3-pro-article.ts [記事ID]');
      console.error('2. 一括修正: npx tsx scripts/fix-all-invalid-summaries.ts');
      console.error('3. ソース別修正: npx tsx scripts/fix-source-summaries.ts [ソース名]');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkInvalidSummaries().catch(console.error);