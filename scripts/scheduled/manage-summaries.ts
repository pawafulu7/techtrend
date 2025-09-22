import { PrismaClient, Article, Source, Prisma } from '@prisma/client';
import fetch from 'node-fetch';
import { normalizeTag, normalizeTags } from '@/lib/utils/tag-normalizer';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { AIService } from '@/lib/ai/ai-service';
import { generateUnifiedPrompt } from '@/lib/utils/article-type-prompts';
import { checkSummaryQuality } from '@/lib/utils/summary-quality-checker';
import { getUnifiedSummaryService } from '@/lib/ai/unified-summary-service';
import { getLastProcessedTime, saveProcessingStatus, hasUpdatedArticlesSince } from '../utils/processing-status';

const prisma = new PrismaClient();

interface GenerateResult {
  generated: number;
  errors: number;
}

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
}

interface Options {
  command: 'generate' | 'regenerate' | 'missing';
  source?: string;
  limit?: number;
  force?: boolean;
  batch?: number;
  days?: number;
}

// API統計情報を追跡
const apiStats = {
  attempts: 0,
  successes: 0,
  failures: 0,
  overloadErrors: 0,
  startTime: Date.now()
};

// コマンドライン引数を解析
function parseArgs(args: string[]): Options {
  const options: Options = {
    command: 'generate',
    limit: 50,
    batch: 10,
    days: 7
  };

  // デフォルトコマンドの判定
  if (args.length === 0 || !['generate', 'regenerate', 'missing'].includes(args[0])) {
    options.command = 'generate';
  } else {
    options.command = args[0] as 'generate' | 'regenerate' | 'missing';
    args = args.slice(1); // コマンドを除去
  }

  // オプションの解析
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '-s':
      case '--source':
        if (nextArg) {
          options.source = nextArg;
          i++;
        }
        break;
      case '-l':
      case '--limit':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          options.limit = parseInt(nextArg);
          i++;
        }
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-b':
      case '--batch':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          options.batch = parseInt(nextArg);
          i++;
        }
        break;
      case '-d':
      case '--days':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          options.days = parseInt(nextArg);
          i++;
        }
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

// ヘルプメッセージを表示
function printHelp() {
  console.error(`
要約生成の統合管理ツール

使用方法:
  npx tsx scripts/core/manage-summaries.ts [コマンド] [オプション]

コマンド:
  generate    要約がない記事の要約を生成 (デフォルト)
  regenerate  既存の要約を再生成
  missing     要約が欠損している記事のみ処理

共通オプション:
  -s, --source <source>  特定のソースのみ処理
  -h, --help            ヘルプを表示

generateオプション:
  -l, --limit <limit>   処理数の上限 (デフォルト: 50)

regenerateオプション:
  -f, --force           強制的に再生成
  -b, --batch <size>    バッチサイズ (デフォルト: 10)

missingオプション:
  -d, --days <days>     過去N日間の記事のみ (デフォルト: 7)
`);
}

// generate-summaries.tsから移植した関数群
async function generateSummaryAndTags(title: string, content: string): Promise<SummaryAndTags> {
  apiStats.attempts++;
  
  try {
    // 統一サービスを使用
    const service = getUnifiedSummaryService();
    const result = await service.generate(title, content, {
      maxRetries: 3,
      minQualityScore: 40
    });
    
    apiStats.successes++;
    return {
      summary: result.summary,
      detailedSummary: result.detailedSummary,
      tags: result.tags
    };
  } catch (error) {
    apiStats.failures++;
    
    // 503エラーのカウント
    if (error instanceof Error && error.message.includes('503')) {
      apiStats.overloadErrors++;
    }
    
    throw error;
  }
}

// テキストクリーンアップ関数
function cleanupText(text: string): string {
  return text
    .replace(/\*\*/g, '') // マークダウン除去
    .replace(/^(本記事は、|本記事は|本稿では、|本稿では|記事では、|記事では|この記事は、|この記事は)/g, '')
    .trim();
}

// 最終クリーンアップ関数
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

// 詳細要約の正規化関数
function normalizeDetailedSummary(text: string): string {
  const lines = text.split('\n');
  const normalizedLines: string[] = [];
  
  // ラベルのマッピング
  const labelPatterns = [
    { pattern: /記事の主題|技術的背景/, expectedLabel: '記事の主題は、', index: 0 },
    { pattern: /具体的な問題|解決しようとしている問題/, expectedLabel: '具体的な問題は、', index: 1 },
    { pattern: /解決策|技術的アプローチ/, expectedLabel: '提示されている解決策は、', index: 2 },
    { pattern: /実装方法|コード例/, expectedLabel: '実装方法の詳細については、', index: 3 },
    { pattern: /期待される効果|性能改善/, expectedLabel: '期待される効果は、', index: 4 },
    { pattern: /注意点|制約事項/, expectedLabel: '実装時の注意点は、', index: 5 }
  ];
  
  let currentIndex = 0;
  
  for (const line of lines) {
    if (line.trim().startsWith('・')) {
      let normalizedLine = line.trim();
      const content = normalizedLine.substring(1).trim();
      
      // ラベルがない場合、インデックスに基づいて追加
      let hasLabel = false;
      for (const labelPattern of labelPatterns) {
        if (content.match(labelPattern.pattern)) {
          hasLabel = true;
          break;
        }
      }
      
      if (!hasLabel && currentIndex < labelPatterns.length) {
        const expectedLabel = labelPatterns[currentIndex].expectedLabel;
        if (expectedLabel) {
          normalizedLine = `・${expectedLabel}${content}`;
        }
      }
      
      normalizedLines.push(normalizedLine);
      currentIndex++;
    } else if (line.trim()) {
      normalizedLines.push(line);
    }
  }
  
  return normalizedLines.join('\n');
}

// parseUnifiedResponseは統一サービス内で処理されるため削除

function parseSummaryAndTags(text: string): SummaryAndTags {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let isDetailedSummary = false;
  let tagSectionStarted = false; // タグセクション開始フラグを追加
  
  // パターン定義
  const summaryPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/
  ];
  
  const detailedSummaryPatterns = [
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/
  ];
  
  const promptPatterns = [
    /^\d+-\d+文字の日本語で/,
    /^簡潔にまとめ/,
    /^以下の観点で/,
    /^記事が解決する問題/,
    /^以下の要素を箇条書き/
  ];

  let summaryStarted = false;
  let detailedSummaryStarted = false;

  for (const line of lines) {
    // プロンプト指示行をスキップ
    if (promptPatterns.some(pattern => pattern.test(line))) {
      continue;
    }
    
    // summary処理
    if (!summaryStarted && summaryPatterns.some(pattern => pattern.test(line))) {
      summary = line;
      summaryPatterns.forEach(pattern => {
        summary = summary.replace(pattern, '');
      });
      summary = cleanupText(summary);
      summaryStarted = true;
      isDetailedSummary = false;
    }
    // summaryの続きの行（空行が来るまで）
    else if (summaryStarted && !detailedSummaryStarted && line.trim() && 
             !detailedSummaryPatterns.some(pattern => pattern.test(line)) && 
             !line.match(/^タグ[:：]/)) {
      summary += '\n' + cleanupText(line);
    }
    // detailedSummary処理
    else if (detailedSummaryPatterns.some(pattern => pattern.test(line))) {
      detailedSummary = line;
      detailedSummaryPatterns.forEach(pattern => {
        detailedSummary = detailedSummary.replace(pattern, '');
      });
      detailedSummary = cleanupText(detailedSummary);
      detailedSummaryStarted = true;
      isDetailedSummary = true;
    }
    // detailedSummaryの続きの行
    else if (isDetailedSummary && line.trim() && !line.match(/^タグ[:：]/)) {
      // 箇条書きの場合はそのまま追加（cleanupTextを適用しない）
      if (line.trim().startsWith('・')) {
        detailedSummary += '\n' + line.trim();
      } else {
        detailedSummary += '\n' + cleanupText(line);
      }
    }
    // タグ処理（修正版）
    else if (line.match(/^タグ[:：]/)) {
      isDetailedSummary = false;
      tagSectionStarted = true; // フラグを立てる
      
      // 同一行にタグがある場合（後方互換性）
      const tagLine = line.replace(/^タグ[:：]\s*/, '');
      if (tagLine.trim()) {
        tags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0 && tag.length <= 30)
          .map(tag => normalizeTag(tag));
        tagSectionStarted = false;
      }
    }
    // タグが次行にある場合の処理（追加）
    else if (tagSectionStarted && line.trim() && !line.match(/^(要約|詳細要約)[:：]/)) {
      tags = line.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 30)
        .map(tag => normalizeTag(tag));
      tagSectionStarted = false;
    }
    // 空行でセクション終了
    else if (!line.trim()) {
      if (summaryStarted && !detailedSummaryStarted) {
        summaryStarted = false;
      }
      tagSectionStarted = false; // タグセクションも終了
    }
  }
  
  // 最終クリーンアップ
  summary = finalCleanup(summary);
  detailedSummary = finalCleanup(detailedSummary);
  
  // 詳細要約の正規化
  detailedSummary = normalizeDetailedSummary(detailedSummary);
  
  // フォールバック
  if (!summary) {
    summary = text.substring(0, 150);
  }
  if (!detailedSummary) {
    detailedSummary = text.substring(0, 300);
  }

  return { summary, detailedSummary, tags };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type ArticleWithSource = Article & { source: Source };

// generateコマンドの実装（generate-summaries.tsから移植）
// 条件付き要約生成: 新規記事がある場合のみ処理
async function checkNewArticles(options?: Options): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const whereCondition: Prisma.ArticleWhereInput = {
    AND: [
      {
        // 要約が未生成（nullまたは空文字）
        OR: [
          { summary: null },
          { summary: '' },
          { detailedSummary: null },
          { detailedSummary: '' }
        ]
      },
      {
        // createdAtがある場合は優先、なければpublishedAtを使用
        OR: [
          { createdAt: { gte: oneHourAgo } },
          {
            createdAt: null,
            publishedAt: { gte: oneHourAgo }
          }
        ]
      }
    ]
  };

  // optionsでsourceが指定されている場合はフィルタリング
  if (options?.source) {
    whereCondition.source = { name: options.source };
  }

  // 存在確認のみのためfindFirstを使用（パフォーマンス向上）
  const hasNewArticle = await prisma.article.findFirst({
    where: whereCondition,
    select: { id: true }
  });

  if (!hasNewArticle) {
    console.error('📋 新規記事なし。要約生成をスキップします。');
    return false;
  }

  // 詳細なカウントが必要な場合のみcount実行
  const newArticlesCount = await prisma.article.count({
    where: whereCondition
  });

  console.error(`📊 ${newArticlesCount}件の新規記事を検出しました。`);
  return true;
}

async function generateSummaries(options: Options): Promise<GenerateResult> {
  console.error('📝 要約とタグの生成を開始します...');
  const startTime = Date.now();

  try {
    // 差分処理: 前回処理以降の新規・更新記事のみを対象にする
    const processName = 'summary-generation';
    const checkpoint = new Date();
    const lastProcessedAt = await getLastProcessedTime(processName);

    // 条件付き処理: 新規記事がない場合はスキップ
    const hasNewArticles = await checkNewArticles(options);
    if (!hasNewArticles && lastProcessedAt) {
      // 前回処理以降に更新された記事がある場合は処理を継続
      const hasUpdates = await hasUpdatedArticlesSince(processName);
      if (!hasUpdates) {
        console.error('📋 新規・更新記事なし。要約生成をスキップします。');
        return { generated: 0, errors: 0 };
      }
    }

    // 1. 要約がない記事を取得
    const articlesWithoutSummaryQuery: Prisma.ArticleFindManyArgs = {
      where: { summary: null },
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: options.limit
    };

    if (options.source) {
      articlesWithoutSummaryQuery.where.source = { name: options.source };
    }

    const articlesWithoutSummary = await prisma.article.findMany(articlesWithoutSummaryQuery) as ArticleWithSource[];

    // 2. 英語の要約を持つ記事を取得（Dev.to, Stack Overflow Blog）
    const englishSources = await prisma.source.findMany({
      where: {
        OR: [
          { name: 'Dev.to' },
          { name: 'Stack Overflow Blog' }
        ]
      }
    });

    const articlesWithEnglishSummary: ArticleWithSource[] = [];
    for (const source of englishSources) {
      if (options.source && source.name !== options.source) continue;

      const articles = await prisma.article.findMany({
        where: {
          sourceId: source.id,
          summary: { not: null }
        },
        include: { source: true },
        take: Math.floor(options.limit! / 2)
      }) as ArticleWithSource[];

      // 日本語を含まない要約を検出
      const englishArticles = articles.filter(article => {
        const summary = article.summary || '';
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(summary);
        return !hasJapanese;
      });

      articlesWithEnglishSummary.push(...englishArticles);
    }

    // 3. 途切れた要約を持つ記事を取得
    const allArticlesWithSummaryQuery: Prisma.ArticleFindManyArgs = {
      where: {
        summary: { not: null }
      },
      include: { source: true },
      take: options.limit! * 2
    };

    if (options.source) {
      allArticlesWithSummaryQuery.where.source = { name: options.source };
    }

    const allArticlesWithSummary = await prisma.article.findMany(allArticlesWithSummaryQuery) as ArticleWithSource[];

    const truncatedArticles = allArticlesWithSummary.filter(article => {
      const summary = article.summary || '';
      // 「。」で終わらない、または200文字で切れている要約
      return !summary.endsWith('。') || summary.length === 200 || summary.length === 203;
    });

    // 4. タグがない記事を取得
    const articlesWithoutTagsQuery: Prisma.ArticleFindManyArgs = {
      where: {
        tags: {
          none: {}
        }
      },
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: options.limit
    };

    if (options.source) {
      articlesWithoutTagsQuery.where.source = { name: options.source };
    }

    const articlesWithoutTags = await prisma.article.findMany(articlesWithoutTagsQuery) as ArticleWithSource[];

    // すべての対象記事を結合
    const allArticlesToProcess = [
      ...articlesWithoutSummary,
      ...articlesWithEnglishSummary,
      ...truncatedArticles,
      ...articlesWithoutTags
    ];

    // 重複を除去
    const uniqueArticles = Array.from(
      new Map(allArticlesToProcess.map(a => [a.id, a])).values()
    );

    if (uniqueArticles.length === 0) {
      console.error('✅ すべての記事が適切な要約とタグを持っています');
      return { generated: 0, errors: 0 };
    }

    console.error(`📄 処理対象の記事数:`);
    console.error(`   - 要約なし: ${articlesWithoutSummary.length}件`);
    console.error(`   - 英語要約: ${articlesWithEnglishSummary.length}件`);
    console.error(`   - 途切れた要約: ${truncatedArticles.length}件`);
    console.error(`   - タグなし: ${articlesWithoutTags.length}件`);
    console.error(`   - 合計（重複除去後）: ${uniqueArticles.length}件`);

    let generatedCount = 0;
    let errorCount = 0;
    const batchSize = 1; // API制限を考慮して並列処理を無効化

    // バッチ処理で要約を生成
    for (let i = 0; i < uniqueArticles.length; i += batchSize) {
      const batch = uniqueArticles.slice(i, i + batchSize);
      console.error(`\n処理中: ${i + 1}-${Math.min(i + batchSize, uniqueArticles.length)}件目`);

      // リトライ機能を追加
      const MAX_RETRIES = 3;
      
      await Promise.all(
        batch.map(async (article) => {
          let retryCount = 0;
          
          while (retryCount < MAX_RETRIES) {
            try {
              const content = article.content || '';
              
              // 既に日本語の要約がある場合はスキップ（Gemini APIを呼ばない）
              const existingSummary = article.summary || '';
              const hasJapaneseSummary = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(existingSummary);
              
              let summary = existingSummary;
              let tags: string[] = [];
              
              // 日本語要約がない場合のみGemini APIを呼び出す
              if (!hasJapaneseSummary || !article.summary || !article.detailedSummary) {
                const result = await generateSummaryAndTags(article.title, content);
                summary = result.summary;
                tags = result.tags;
                
                // 要約を更新
                await prisma.article.update({
                  where: { id: article.id },
                  data: { 
                    summary,
                    detailedSummary: result.detailedSummary,
                    articleType: 'unified',
                    summaryVersion: getUnifiedSummaryService().getSummaryVersion()
                  }
                });
              } else {
                // 既に日本語要約がある場合でもタグがなければタグのみ生成
                const existingTags = await prisma.article.findUnique({
                  where: { id: article.id },
                  include: { tags: true }
                });
                
                if (!existingTags?.tags || existingTags.tags.length === 0) {
                  const result = await generateSummaryAndTags(article.title, content);
                  tags = result.tags;
                } else {
                  console.error(`○ [${article.source.name}] ${article.title.substring(0, 40)}... (日本語要約あり、スキップ)`);
                  return;
                }
              }

              // タグを処理
              if (tags.length > 0) {
                // 既存のタグを取得または作成
                const tagRecords = await Promise.all(
                  tags.map(async (tagName) => {
                    const existingTag = await prisma.tag.findUnique({
                      where: { name: tagName }
                    });

                    if (existingTag) {
                      return existingTag;
                    }

                    return await prisma.tag.create({
                      data: { name: tagName }
                    });
                  })
                );

                // 記事にタグを関連付ける
                await prisma.article.update({
                  where: { id: article.id },
                  data: {
                    tags: {
                      connect: tagRecords.map(tag => ({ id: tag.id }))
                    }
                  }
                });
              }
              
              console.error(`✓ [${article.source.name}] ${article.title.substring(0, 40)}... (タグ: ${tags.join(', ')})`);
              generatedCount++;
              break; // 成功したらループを抜ける
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              
              if ((errorMessage.includes('503') || errorMessage.includes('overloaded')) && retryCount < MAX_RETRIES - 1) {
                retryCount++;
                apiStats.overloadErrors++;
                
                // エクスポネンシャルバックオフ: 10秒 → 20秒 → 40秒
                const waitTime = 10000 * Math.pow(2, retryCount - 1);
                console.error(`  リトライ ${retryCount}/${MAX_RETRIES} - ${waitTime/1000}秒待機中...`);
                await sleep(waitTime);
                continue;
              }
              
              console.error(`✗ [${article.source.name}] ${article.title.substring(0, 40)}...`);
              console.error(`  エラー: ${errorMessage}`);
              errorCount++;
              apiStats.failures++;
              break;
            }
          }
        })
      );

      // API レート制限対策（503エラー対策で待機時間を増やす）
      if (i + batchSize < uniqueArticles.length) {
        await sleep(5000); // レート制限対策として5秒に延長
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const totalDuration = Math.round((Date.now() - apiStats.startTime) / 1000);
    const successRate = apiStats.attempts > 0 ? Math.round((apiStats.successes / apiStats.attempts) * 100) : 0;
    
    console.error(`\n📊 要約とタグ生成完了:`);
    console.error(`   成功: ${generatedCount}件`);
    console.error(`   エラー: ${errorCount}件`);
    console.error(`   処理時間: ${duration}秒`);

    // 要約が生成された場合はキャッシュを無効化
    if (generatedCount > 0) {
      console.error('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
    }
    console.error(`\n📈 API統計:`);
    console.error(`   総試行回数: ${apiStats.attempts}`);
    console.error(`   成功: ${apiStats.successes}`);
    console.error(`   失敗: ${apiStats.failures}`);
    console.error(`   503エラー: ${apiStats.overloadErrors}`);
    console.error(`   成功率: ${successRate}%`);
    console.error(`   実行時間: ${totalDuration}秒`);
    
    // 成功率が低い場合は警告
    if (successRate < 50 && apiStats.attempts > 10) {
      console.error(`\n⚠️  警告: API成功率が${successRate}%と低いです。深夜の実行を推奨します。`);
    }

    // 処理状態を記録（差分処理用）
    await saveProcessingStatus(
      processName,
      generatedCount,
      errorCount > 0 ? 'partial' : 'success',
      {
        processedCount: generatedCount,
        errorCount,
        duration: totalDuration,
        apiStats,
        checkpoint
      },
      checkpoint
    );

    return { generated: generatedCount, errors: errorCount };

  } catch (error) {
    console.error('❌ 要約生成エラー:', error);
    throw error;
  }
}

// regenerateコマンドの実装
async function regenerateSummaries(options: Options): Promise<GenerateResult> {
  console.error('📝 要約の再生成を開始します...');
  const startTime = Date.now();

  try {
    const query: Prisma.ArticleFindManyArgs = {
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: options.batch || 10
    };

    // 強制再生成でない場合は、問題のある要約のみ対象
    if (!options.force) {
      query.where = {
        OR: [
          { summary: { endsWith: '...' } },
          { summary: { contains: 'エラー' } },
          { detailedSummary: null }
        ]
      };
    }

    if (options.source) {
      query.where = query.where || {};
      query.where.source = { name: options.source };
    }

    const articles = await prisma.article.findMany(query) as ArticleWithSource[];

    if (articles.length === 0) {
      console.error('✅ 再生成対象の記事はありません');
      return { generated: 0, errors: 0 };
    }

    console.error(`📄 再生成対象: ${articles.length}件`);
    
    let generatedCount = 0;
    let errorCount = 0;

    for (const article of articles) {
      try {
        console.error(`\n処理中: [${article.source.name}] ${article.title}`);
        
        const content = article.content || '';
        const result = await generateSummaryAndTags(article.title, content);
        
        // 要約を更新
        await prisma.article.update({
          where: { id: article.id },
          data: { 
            summary: result.summary,
            detailedSummary: result.detailedSummary
          }
        });

        // タグも更新
        if (result.tags.length > 0) {
          const tagRecords = await Promise.all(
            result.tags.map(async (tagName) => {
              const existingTag = await prisma.tag.findUnique({
                where: { name: tagName }
              });

              if (existingTag) {
                return existingTag;
              }

              return await prisma.tag.create({
                data: { name: tagName }
              });
            })
          );

          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                set: [], // 既存のタグをクリア
                connect: tagRecords.map(tag => ({ id: tag.id }))
              }
            }
          });
        }
        
        console.error(`✓ 再生成完了`);
        generatedCount++;
        
        // API制限対策
        await sleep(3000);
        
      } catch (error) {
        console.error(`✗ エラー: ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n📊 再生成完了:`);
    console.error(`   成功: ${generatedCount}件`);
    console.error(`   エラー: ${errorCount}件`);
    console.error(`   処理時間: ${duration}秒`);

    return { generated: generatedCount, errors: errorCount };

  } catch (error) {
    console.error('❌ 再生成エラー:', error);
    throw error;
  }
}

// missingコマンドの実装
async function generateMissingSummaries(options: Options): Promise<GenerateResult> {
  console.error('📝 要約が欠損している記事の処理を開始します...');
  
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - (options.days || 7));

    const query: Prisma.ArticleFindManyArgs = {
      where: {
        OR: [
          { summary: null },
          { summary: '' }
        ],
        publishedAt: {
          gte: daysAgo
        }
      },
      include: { source: true },
      orderBy: { publishedAt: 'desc' }
    };

    if (options.source) {
      query.where.source = { name: options.source };
    }

    const articles = await prisma.article.findMany(query) as ArticleWithSource[];
    
    console.error(`📄 処理対象: ${articles.length}件（過去${options.days}日間）`);
    
    if (articles.length === 0) {
      console.error('✅ 要約が欠損している記事はありません');
      return { generated: 0, errors: 0 };
    }

    let generatedCount = 0;
    let errorCount = 0;
    
    for (const article of articles) {
      try {
        console.error(`\n処理中: [${article.source.name}] ${article.title}`);
        
        const content = article.content || article.title;
        const result = await generateSummaryAndTags(article.title, content);
        
        // 要約を更新
        await prisma.article.update({
          where: { id: article.id },
          data: { 
            summary: result.summary,
            detailedSummary: result.detailedSummary
          }
        });

        // タグも処理
        if (result.tags.length > 0) {
          const tagRecords = await Promise.all(
            result.tags.map(async (tagName) => {
              const existingTag = await prisma.tag.findUnique({
                where: { name: tagName }
              });

              if (existingTag) {
                return existingTag;
              }

              return await prisma.tag.create({
                data: { name: tagName }
              });
            })
          );

          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                connect: tagRecords.map(tag => ({ id: tag.id }))
              }
            }
          });
        }
        
        console.error(`✓ 要約生成完了`);
        console.error(`  要約: ${result.summary.substring(0, 100)}...`);
        
        generatedCount++;
        
        // レート制限対策
        await sleep(2000);
        
      } catch (error) {
        console.error(`✗ エラー: ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
      }
    }
    
    console.error(`\n📊 処理完了:`);
    console.error(`   成功: ${generatedCount}件`);
    console.error(`   エラー: ${errorCount}件`);

    return { generated: generatedCount, errors: errorCount };
    
  } catch (error) {
    console.error('❌ 処理エラー:', error);
    throw error;
  }
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  try {
    let result: GenerateResult;

    switch (options.command) {
      case 'generate':
        result = await generateSummaries(options);
        break;
      case 'regenerate':
        result = await regenerateSummaries(options);
        break;
      case 'missing':
        result = await generateMissingSummaries(options);
        break;
      default:
        console.error('不明なコマンド:', options.command);
        printHelp();
        process.exit(1);
    }

    process.exit(result.errors > 0 ? 1 : 0);

  } catch (error) {
    console.error('実行エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  main();
}

// エクスポート（scheduler-v2.tsから呼び出せるように）
export { generateSummaries };