import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// テキストクリーンアップ関数（generate-summaries.tsと同じ）
function cleanupText(text: string): string {
  return text
    .replace(/\*\*/g, '') // マークダウン除去
    .replace(/^(本記事は、|本記事は|本稿では、|本稿では|記事では、|記事では|この記事は、|この記事は)/g, '')
    .trim();
}

// 最終クリーンアップ関数（generate-summaries.tsと同じ）
function finalCleanup(text: string): string {
  if (!text) return text;
  
  // 冒頭の重複ラベル除去
  const cleanupPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/,
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/,
    /^【?\d+-\d+文字.*?】?\s*/,  // プロンプト指示の除去
    /^【?簡潔にまとめ.*?】?\s*/
  ];
  
  cleanupPatterns.forEach(pattern => {
    text = text.replace(pattern, '');
  });
  
  // 先頭の句読点を除去
  text = text.replace(/^[、。]\s*/, '');
  
  // 改行の正規化
  text = text.replace(/\n+/g, '\n').trim();
  
  // 文末に句点がない場合は追加（箇条書きの場合は除く）
  if (text && !text.includes('・') && !text.match(/[。！？]$/)) {
    text += '。';
  }
  
  return text;
}

// 問題のあるパターンを検出
function hasProblematicPattern(text: string | null): boolean {
  if (!text) return false;
  
  const problematicPatterns = [
    /^\*\*[^*]+\*\*:/, // マークダウンラベル
    /^【[^】]+】[:：]?/, // 【】形式のラベル
    /\d+-\d+文字/, // プロンプト指示
    /^要約[:：]/, // 要約ラベル
    /^詳細要約[:：]/, // 詳細要約ラベル
    /^短い要約[:：]/, // 短い要約ラベル
    /^[、。]/, // 先頭の句読点
    /簡潔にまとめ/ // プロンプト指示
  ];
  
  // 文末に句点がない場合も問題とする（箇条書きを除く）
  if (text && !text.includes('・') && !text.match(/[。！？]$/)) {
    return true;
  }
  
  return problematicPatterns.some(pattern => pattern.test(text));
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups');
  const backupFile = path.join(backupDir, `summaries-backup-${timestamp}.json`);
  
  // バックアップディレクトリの作成
  await fs.mkdir(backupDir, { recursive: true });
  
  // 問題のある要約を持つ記事を取得
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
      detailedSummary: true
    }
  });
  
  // バックアップファイルの作成
  await fs.writeFile(backupFile, JSON.stringify(articles, null, 2));
  
  console.log(`バックアップを作成しました: ${backupFile}`);
  return backupFile;
}

async function fixExistingSummaries(dryRun: boolean = true) {
  console.log(`既存要約の修正を開始します（${dryRun ? 'ドライラン' : '本番実行'}モード）\n`);
  
  if (!dryRun) {
    // 本番実行時はバックアップを作成
    await createBackup();
  }
  
  // 問題のある要約を持つ記事を取得
  const articles = await prisma.article.findMany({
    where: {
      OR: [
        { summary: { not: null } },
        { detailedSummary: { not: null } }
      ]
    }
  });
  
  console.log(`対象記事数: ${articles.length}件\n`);
  
  let summaryFixCount = 0;
  let detailedSummaryFixCount = 0;
  let errorCount = 0;
  
  for (const article of articles) {
    try {
      let needsUpdate = false;
      let updatedSummary = article.summary;
      let updatedDetailedSummary = article.detailedSummary;
      
      // summaryの修正
      if (article.summary && hasProblematicPattern(article.summary)) {
        const cleaned = finalCleanup(article.summary);
        if (cleaned !== article.summary) {
          console.log(`\n[Summary修正] ${article.title.substring(0, 50)}...`);
          console.log(`  変更前: ${article.summary.substring(0, 100)}...`);
          console.log(`  変更後: ${cleaned.substring(0, 100)}...`);
          updatedSummary = cleaned;
          needsUpdate = true;
          summaryFixCount++;
        }
      }
      
      // detailedSummaryの修正
      if (article.detailedSummary && hasProblematicPattern(article.detailedSummary)) {
        const cleaned = finalCleanup(article.detailedSummary);
        if (cleaned !== article.detailedSummary) {
          console.log(`\n[DetailedSummary修正] ${article.title.substring(0, 50)}...`);
          console.log(`  変更前: ${article.detailedSummary.substring(0, 100)}...`);
          console.log(`  変更後: ${cleaned.substring(0, 100)}...`);
          updatedDetailedSummary = cleaned;
          needsUpdate = true;
          detailedSummaryFixCount++;
        }
      }
      
      // データベースの更新（本番実行時のみ）
      if (needsUpdate && !dryRun) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: updatedSummary,
            detailedSummary: updatedDetailedSummary
          }
        });
      }
      
    } catch (error) {
      console.error(`\nエラー: ${article.title}`);
      console.error(error);
      errorCount++;
    }
  }
  
  // 結果サマリー
  console.log('\n' + '='.repeat(80));
  console.log('修正結果サマリー:');
  console.log(`  総記事数: ${articles.length}件`);
  console.log(`  Summary修正: ${summaryFixCount}件`);
  console.log(`  DetailedSummary修正: ${detailedSummaryFixCount}件`);
  console.log(`  エラー: ${errorCount}件`);
  
  if (dryRun) {
    console.log('\n※ これはドライランです。実際のデータベースは変更されていません。');
    console.log('本番実行するには --execute オプションを付けて実行してください。');
  } else {
    console.log('\n✅ データベースが更新されました。');
  }
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--execute');
  
  try {
    await fixExistingSummaries(isDryRun);
  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  main();
}