import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeProblems() {
  // 問題データを読み込み
  const data = JSON.parse(readFileSync('/home/tomoaki/work/techtrend/data/problematic-articles.json', 'utf-8'));
  const articleIds = data.articleIds;

  console.log('問題のある記事の詳細分析');
  console.log('=====================================');
  console.log('総記事数: ' + articleIds.length);

  // データベースから記事を取得
  const articles = await prisma.article.findMany({
    where: {
      id: { in: articleIds }
    }
  });

  // ソース別の統計
  const sourceStats = new Map();
  const problemTypeStats = {
    noSummary: 0,
    noDetailedSummary: 0,
    summaryTooShort: 0,
    summaryTooLong: 0,
    detailedSummaryNotBullet: 0,
    detailedSummaryTooShort: 0,
    truncated: 0
  };

  for (const article of articles) {
    const source = article.source || 'Unknown';
    
    // ソース別カウント
    sourceStats.set(source, (sourceStats.get(source) || 0) + 1);

    // 問題タイプの分析
    if (!article.summary) {
      problemTypeStats.noSummary++;
    } else if (article.summary.length < 50) {
      problemTypeStats.summaryTooShort++;
    } else if (article.summary.length > 200) {
      problemTypeStats.summaryTooLong++;
      // 途切れている可能性のチェック
      if (article.summary.length === 200 && !article.summary.match(/[。！？]$/)) {
        problemTypeStats.truncated++;
      }
    }

    if (!article.detailedSummary) {
      problemTypeStats.noDetailedSummary++;
    } else {
      const lines = article.detailedSummary.split('\n').filter(l => l.trim());
      const hasBulletPoints = lines.some(line => line.startsWith('・'));
      
      if (!hasBulletPoints) {
        problemTypeStats.detailedSummaryNotBullet++;
      }
      
      if (article.detailedSummary.length < 150) {
        problemTypeStats.detailedSummaryTooShort++;
      }
    }
  }

  // 結果を表示
  console.log('\n【ソース別の問題記事数】');
  const sortedSources = Array.from(sourceStats.entries()).sort((a, b) => b[1] - a[1]);
  for (const [source, count] of sortedSources) {
    console.log('  ' + source + ': ' + count + '件');
  }

  console.log('\n【問題タイプ別の統計】');
  console.log('  要約なし: ' + problemTypeStats.noSummary + '件');
  console.log('  要約が短すぎる（<50文字）: ' + problemTypeStats.summaryTooShort + '件');
  console.log('  要約が長すぎる（>200文字）: ' + problemTypeStats.summaryTooLong + '件');
  console.log('  要約が途切れている可能性: ' + problemTypeStats.truncated + '件');
  console.log('  詳細要約なし: ' + problemTypeStats.noDetailedSummary + '件');
  console.log('  詳細要約が箇条書きでない: ' + problemTypeStats.detailedSummaryNotBullet + '件');
  console.log('  詳細要約が短すぎる（<150文字）: ' + problemTypeStats.detailedSummaryTooShort + '件');

  // 最も問題のあるソースのサンプルを表示
  const topProblematicSource = sortedSources[0][0];
  const sampleArticles = articles.filter(a => a.source === topProblematicSource).slice(0, 3);
  
  console.log('\n【問題の多い「' + topProblematicSource + '」のサンプル】');
  for (const article of sampleArticles) {
    console.log('\n  タイトル: ' + article.title.substring(0, 50) + '...');
    console.log('  要約文字数: ' + (article.summary?.length || 0));
    console.log('  詳細要約文字数: ' + (article.detailedSummary?.length || 0));
    if (article.summary && article.summary.length > 180) {
      console.log('  要約（末尾50文字）: ...' + article.summary.substring(article.summary.length - 50));
    }
  }

  await prisma.$disconnect();
}

analyzeProblems().catch(console.error);