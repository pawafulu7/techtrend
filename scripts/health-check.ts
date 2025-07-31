import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const prisma = new PrismaClient();
const execAsync = promisify(exec);

interface HealthCheckResult {
  database: boolean;
  recentArticles: boolean;
  scheduler: boolean;
  summaryGeneration: {
    totalArticles: number;
    withSummary: number;
    percentage: number;
  };
  apiHealth: {
    lastRunTime?: Date;
    successRate?: number;
  };
}

async function healthCheck(): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    database: false,
    recentArticles: false,
    scheduler: false,
    summaryGeneration: {
      totalArticles: 0,
      withSummary: 0,
      percentage: 0
    },
    apiHealth: {
      lastRunTime: undefined,
      successRate: undefined
    }
  };
  
  try {
    // 1. データベース接続確認
    await prisma.$queryRaw`SELECT 1`;
    result.database = true;
    console.log('✅ データベース: 正常');
    
    // 2. 24時間以内の記事確認
    const recentCount = await prisma.article.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });
    result.recentArticles = recentCount > 0;
    console.log(`${result.recentArticles ? '✅' : '❌'} 新規記事（24時間以内）: ${recentCount}件`);
    
    // 3. PM2プロセス確認
    try {
      const { stdout } = await execAsync('pm2 status techtrend-scheduler');
      result.scheduler = stdout.includes('online');
      console.log(`${result.scheduler ? '✅' : '❌'} スケジューラー: ${result.scheduler ? '稼働中' : '停止中'}`);
    } catch (error) {
      result.scheduler = false;
      console.log('❌ スケジューラー: 停止中');
    }
    
    // 4. 要約生成状況の確認
    const [totalArticles, articlesWithSummary] = await Promise.all([
      prisma.article.count(),
      prisma.article.count({ where: { summary: { not: null } } })
    ]);
    
    result.summaryGeneration.totalArticles = totalArticles;
    result.summaryGeneration.withSummary = articlesWithSummary;
    result.summaryGeneration.percentage = totalArticles > 0 
      ? Math.round((articlesWithSummary / totalArticles) * 100) 
      : 0;
    
    console.log(`📊 要約生成状況: ${articlesWithSummary}/${totalArticles} (${result.summaryGeneration.percentage}%)`);
    
    // 5. 最近の要約生成時刻を確認
    const recentSummaries = await prisma.article.findMany({
      where: {
        summary: { not: null },
        updatedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } // 48時間以内
      },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });
    
    if (recentSummaries.length > 0) {
      result.apiHealth.lastRunTime = recentSummaries[0].updatedAt;
      console.log(`📅 最終要約生成: ${result.apiHealth.lastRunTime.toLocaleString('ja-JP')}`);
    }
    
    // 6. タグ付け状況の確認
    const articlesWithTags = await prisma.article.count({
      where: {
        tags: {
          some: {}
        }
      }
    });
    const tagPercentage = totalArticles > 0 
      ? Math.round((articlesWithTags / totalArticles) * 100) 
      : 0;
    console.log(`🏷️  タグ付け状況: ${articlesWithTags}/${totalArticles} (${tagPercentage}%)`);
    
    // 7. エラーログの確認
    try {
      const { stdout: errorLog } = await execAsync('tail -n 20 logs/scheduler-error.log 2>/dev/null || echo ""');
      const recentErrors = errorLog.split('\n').filter(line => 
        line.includes('503') || line.includes('overloaded')
      ).length;
      
      if (recentErrors > 0) {
        console.log(`⚠️  最近のAPI 503エラー: ${recentErrors}件`);
      }
    } catch (error) {
      // エラーログファイルが存在しない場合は無視
    }
    
    // 総合評価
    console.log('\n📊 総合評価:');
    const issues = [];
    
    if (!result.database) issues.push('データベース接続');
    if (!result.recentArticles) issues.push('新規記事取得');
    if (!result.scheduler) issues.push('スケジューラー');
    if (result.summaryGeneration.percentage < 50) issues.push('要約生成率が低い');
    if (tagPercentage < 10) issues.push('タグ付け率が低い');
    
    if (issues.length === 0) {
      console.log('✅ すべて正常に動作しています');
    } else {
      console.log(`⚠️  以下の問題があります:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    // 推奨アクション
    if (!result.scheduler) {
      console.log('\n💡 推奨アクション:');
      console.log('   pm2 start ecosystem.config.js');
    }
    
    if (result.summaryGeneration.percentage < 50) {
      console.log('\n💡 推奨アクション:');
      console.log('   深夜2時の要約生成を待つか、手動で実行:');
      console.log('   npx tsx scripts/generate-summaries.ts');
    }
    
  } catch (error) {
    console.error('❌ ヘルスチェックエラー:', error);
  } finally {
    await prisma.$disconnect();
  }
  
  return result;
}

// 直接実行された場合
if (require.main === module) {
  healthCheck()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { healthCheck };