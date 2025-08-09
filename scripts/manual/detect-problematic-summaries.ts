import { PrismaClient } from '@prisma/client';
import { checkContentQuality } from '@/lib/utils/content-quality-checker';

const prisma = new PrismaClient();

async function detectProblematicSummaries() {
  console.log('🔍 問題のある要約を検出中...\n');
  
  try {
    const minScore = parseInt(process.env.QUALITY_MIN_SCORE || '70');
    
    // すべての要約を取得
    const articles = await prisma.article.findMany({
      where: {
        summary: { not: null }
      },
      include: {
        source: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
    
    console.log(`検査対象: ${articles.length}件の記事\n`);
    
    const problematicArticles = [];
    const issueCategories = {
      critical: [],
      major: [],
      minor: []
    };
    
    for (const article of articles) {
      const result = checkContentQuality(
        article.summary || '',
        article.detailedSummary || undefined,
        article.title
      );
      
      if (result.score < minScore || result.requiresRegeneration) {
        problematicArticles.push({
          id: article.id,
          title: article.title,
          source: article.source.name,
          score: result.score,
          issues: result.issues,
          requiresRegeneration: result.requiresRegeneration,
          regenerationReason: result.regenerationReason
        });
        
        // 深刻度別に分類
        const hasCritical = result.issues.some(i => i.severity === 'critical');
        const hasMajor = result.issues.some(i => i.severity === 'major');
        
        if (hasCritical) {
          issueCategories.critical.push(article.id);
        } else if (hasMajor) {
          issueCategories.major.push(article.id);
        } else {
          issueCategories.minor.push(article.id);
        }
      }
    }
    
    if (problematicArticles.length === 0) {
      console.log('✅ すべての要約が品質基準を満たしています！');
      return;
    }
    
    // 結果を表示
    console.log('=' .repeat(80));
    console.log(`📋 問題のある要約: ${problematicArticles.length}件`);
    console.log('=' .repeat(80));
    
    // 深刻度別に表示
    if (issueCategories.critical.length > 0) {
      console.log('\n🔴 Critical（重大な問題）:');
      const criticalArticles = problematicArticles.filter(a => 
        issueCategories.critical.includes(a.id)
      );
      
      criticalArticles.forEach(article => {
        console.log(`\n  [${article.source}] ${article.title.substring(0, 50)}...`);
        console.log(`  スコア: ${article.score}/100`);
        console.log(`  再生成理由: ${article.regenerationReason}`);
        article.issues.forEach(issue => {
          if (issue.severity === 'critical') {
            console.log(`  - ${issue.type}: ${issue.description}`);
          }
        });
      });
    }
    
    if (issueCategories.major.length > 0) {
      console.log('\n🟡 Major（主要な問題）:');
      const majorArticles = problematicArticles.filter(a => 
        issueCategories.major.includes(a.id) && 
        !issueCategories.critical.includes(a.id)
      );
      
      majorArticles.forEach(article => {
        console.log(`\n  [${article.source}] ${article.title.substring(0, 50)}...`);
        console.log(`  スコア: ${article.score}/100`);
        article.issues.forEach(issue => {
          if (issue.severity === 'major') {
            console.log(`  - ${issue.type}: ${issue.description}`);
          }
        });
      });
    }
    
    if (issueCategories.minor.length > 0) {
      console.log('\n🟢 Minor（軽微な問題）:');
      const minorArticles = problematicArticles.filter(a => 
        issueCategories.minor.includes(a.id) && 
        !issueCategories.critical.includes(a.id) && 
        !issueCategories.major.includes(a.id)
      );
      
      console.log(`  ${minorArticles.length}件の記事に軽微な問題があります。`);
    }
    
    // 統計サマリー
    console.log('\n' + '=' .repeat(80));
    console.log('📊 統計サマリー:');
    console.log(`  総検査数: ${articles.length}件`);
    console.log(`  問題あり: ${problematicArticles.length}件 (${Math.round(problematicArticles.length / articles.length * 100)}%)`);
    console.log(`  - Critical: ${issueCategories.critical.length}件`);
    console.log(`  - Major: ${issueCategories.major.length}件`);
    console.log(`  - Minor: ${issueCategories.minor.length}件`);
    
    // 問題タイプ別集計
    const issueTypeCount = {};
    problematicArticles.forEach(article => {
      article.issues.forEach(issue => {
        issueTypeCount[issue.type] = (issueTypeCount[issue.type] || 0) + 1;
      });
    });
    
    console.log('\n問題タイプ別:');
    Object.entries(issueTypeCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}件`);
      });
    
    // 再生成が必要な記事のID一覧を出力
    const needsRegeneration = problematicArticles
      .filter(a => a.requiresRegeneration)
      .map(a => a.id);
    
    if (needsRegeneration.length > 0) {
      console.log('\n💡 対処方法:');
      console.log(`  ${needsRegeneration.length}件の記事で要約の再生成が推奨されます。`);
      console.log('  以下のコマンドで再生成を実行できます:');
      console.log('  npm run regenerate:english-mixed');
      
      // IDリストをファイルに保存
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const dataDir = path.join(process.cwd(), 'data');
      await fs.mkdir(dataDir, { recursive: true });
      
      const outputPath = path.join(dataDir, 'problematic-articles.json');
      await fs.writeFile(
        outputPath,
        JSON.stringify({
          generatedAt: new Date(),
          totalProblematic: problematicArticles.length,
          needsRegeneration: needsRegeneration.length,
          articleIds: needsRegeneration,
          details: problematicArticles
        }, null, 2)
      );
      
      console.log(`\n📁 詳細データを保存しました: ${outputPath}`);
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行
if (require.main === module) {
  detectProblematicSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}