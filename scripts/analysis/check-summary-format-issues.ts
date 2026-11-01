import { createPrismaClient } from '@/lib/prisma/create-client';

const prisma = createPrismaClient();

async function checkSummaryFormatIssues() {
  // 詳細要約のフォーマット問題を詳しく調査
  const articles = await prisma.article.findMany({
    where: {
      detailedSummary: { not: null }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  console.error('詳細要約フォーマット問題の調査');
  console.error('=====================================');
  console.error('総検査数: ' + articles.length + '件\n');

  const formatIssues = {
    singleLine: 0,
    noBulletPoints: 0,
    mixedFormat: 0,
    truncated: 0,
    tooShort: 0,
    tooLong: 0,
    correct: 0
  };

  const problematicArticles: any[] = [];

  for (const article of articles) {
    const detailedSummary = article.detailedSummary || '';
    const lines = detailedSummary.split('\n').filter(l => l.trim());
    
    const issues: string[] = [];
    
    // 1行にまとまっている（改行されていない）
    if (lines.length === 1 && detailedSummary.includes('・')) {
      formatIssues.singleLine++;
      issues.push('1行にまとまっている');
    }
    
    // 箇条書きでない
    const hasBulletPoints = lines.some(line => line.startsWith('・'));
    if (!hasBulletPoints && lines.length > 1) {
      formatIssues.noBulletPoints++;
      issues.push('箇条書き形式でない');
    }
    
    // 混在フォーマット（一部だけ箇条書き）
    if (hasBulletPoints && !lines.every(line => line.startsWith('・'))) {
      formatIssues.mixedFormat++;
      issues.push('混在フォーマット');
    }
    
    // 途切れている
    const lastLine = lines[lines.length - 1] || '';
    if (lastLine && !lastLine.match(/[。！？]$/)) {
      formatIssues.truncated++;
      issues.push('文章が途切れている');
    }
    
    // 文字数の問題
    if (detailedSummary.length < 150) {
      formatIssues.tooShort++;
      issues.push('短すぎる（' + detailedSummary.length + '文字）');
    } else if (detailedSummary.length > 500) {
      formatIssues.tooLong++;
      issues.push('長すぎる（' + detailedSummary.length + '文字）');
    }
    
    if (issues.length === 0) {
      formatIssues.correct++;
    } else {
      problematicArticles.push({
        id: article.id,
        title: article.title?.substring(0, 50) + '...',
        issues: issues,
        lineCount: lines.length,
        charCount: detailedSummary.length,
        sample: detailedSummary.substring(0, 100) + '...'
      });
    }
  }

  // 統計を表示
  console.error('【フォーマット問題の統計】');
  console.error('  正常: ' + formatIssues.correct + '件');
  console.error('  1行にまとまっている: ' + formatIssues.singleLine + '件');
  console.error('  箇条書きでない: ' + formatIssues.noBulletPoints + '件');
  console.error('  混在フォーマット: ' + formatIssues.mixedFormat + '件');
  console.error('  文章が途切れている: ' + formatIssues.truncated + '件');
  console.error('  短すぎる（<150文字）: ' + formatIssues.tooShort + '件');
  console.error('  長すぎる（>500文字）: ' + formatIssues.tooLong + '件');

  // 問題のある記事のサンプルを表示
  console.error('\n【問題のある記事のサンプル（最初の5件）】');
  for (const article of problematicArticles.slice(0, 5)) {
    console.error('\nタイトル: ' + article.title);
    console.error('問題: ' + article.issues.join(', '));
    console.error('行数: ' + article.lineCount + ', 文字数: ' + article.charCount);
    console.error('サンプル: ' + article.sample);
  }

  // 改行されていない箇条書きの詳細確認
  console.error('\n【1行にまとまっている箇条書きの詳細】');
  const singleLineArticles = articles.filter(a => {
    const ds = a.detailedSummary || '';
    const lines = ds.split('\n').filter(l => l.trim());
    return lines.length === 1 && ds.includes('・');
  });

  for (const article of singleLineArticles.slice(0, 3)) {
    console.error('\nタイトル: ' + article.title?.substring(0, 50) + '...');
    console.error('詳細要約:');
    console.error(article.detailedSummary);
    console.error('---');
  }

  await prisma.$disconnect();
}

checkSummaryFormatIssues().catch(console.error);