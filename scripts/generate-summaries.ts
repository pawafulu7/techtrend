import { PrismaClient, Article, Source } from '@prisma/client';
import fetch from 'node-fetch';
import { normalizeTag, normalizeTags } from '@/lib/utils/tag-normalizer';
import { detectArticleType } from '@/lib/utils/article-type-detector';
import { generatePromptForArticleType } from '@/lib/utils/article-type-prompts';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';

const prisma = new PrismaClient();

interface GenerateResult {
  generated: number;
  errors: number;
}

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType: string;
}

// API統計情報を追跡
const apiStats = {
  attempts: 0,
  successes: 0,
  failures: 0,
  overloadErrors: 0,
  startTime: Date.now()
};

async function generateSummaryAndTags(title: string, content: string): Promise<SummaryAndTags> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  // 記事タイプを判定
  const articleType = detectArticleType(title, content);
  
  // 記事タイプに応じたプロンプトを生成
  const prompt = generatePromptForArticleType(articleType, title, content);

  apiStats.attempts++;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1200,  // 詳細要約が途切れないよう増加
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  const result = parseSummaryAndTags(responseText);
  return { ...result, articleType };
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

async function generateSummaries(): Promise<GenerateResult> {
  console.log('📝 要約とタグの生成を開始します...');
  const startTime = Date.now();

  try {
    // 1. 要約がない記事を取得
    const articlesWithoutSummary = await prisma.article.findMany({
      where: { summary: null },
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: 100
    }) as ArticleWithSource[];

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
      const articles = await prisma.article.findMany({
        where: {
          sourceId: source.id,
          summary: { not: null }
        },
        include: { source: true },
        take: 50
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
    const allArticlesWithSummary = await prisma.article.findMany({
      where: {
        summary: { not: null }
      },
      include: { source: true },
      take: 200
    }) as ArticleWithSource[];

    const truncatedArticles = allArticlesWithSummary.filter(article => {
      const summary = article.summary || '';
      const detailedSummary = article.detailedSummary || '';
      // 「。」で終わらない、または200文字で切れている要約
      const summaryTruncated = !summary.endsWith('。') || summary.length === 200 || summary.length === 203;
      // 詳細要約が途切れている（句点で終わらない、かつ箇条書きでない）
      const detailedTruncated = detailedSummary.length > 0 && 
        !detailedSummary.match(/[。！？]$/) && 
        !detailedSummary.includes('・');
      return summaryTruncated || detailedTruncated;
    });

    // 4. タグがない記事を取得
    const articlesWithoutTags = await prisma.article.findMany({
      where: {
        tags: {
          none: {}
        }
      },
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: 100
    }) as ArticleWithSource[];

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
      console.log('✅ すべての記事が適切な要約とタグを持っています');
      return { generated: 0, errors: 0 };
    }

    console.log(`📄 処理対象の記事数:`);
    console.log(`   - 要約なし: ${articlesWithoutSummary.length}件`);
    console.log(`   - 英語要約: ${articlesWithEnglishSummary.length}件`);
    console.log(`   - 途切れた要約: ${truncatedArticles.length}件`);
    console.log(`   - タグなし: ${articlesWithoutTags.length}件`);
    console.log(`   - 合計（重複除去後）: ${uniqueArticles.length}件`);

    let generatedCount = 0;
    let errorCount = 0;
    const batchSize = 1; // API制限を考慮して並列処理を無効化

    // バッチ処理で要約を生成
    for (let i = 0; i < uniqueArticles.length; i += batchSize) {
      const batch = uniqueArticles.slice(i, i + batchSize);
      console.log(`\n処理中: ${i + 1}-${Math.min(i + batchSize, uniqueArticles.length)}件目`);

      // リトライ機能を追加
      const MAX_RETRIES = 3;
      
      await Promise.all(
        batch.map(async (article) => {
          let retryCount = 0;
          
          while (retryCount < MAX_RETRIES) {
            try {
            const content = article.content || article.description || '';
            
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
              
              // 要約を更新（新形式として保存）
              await prisma.article.update({
                where: { id: article.id },
                data: { 
                  summary,
                  detailedSummary: result.detailedSummary,
                  articleType: result.articleType,
                  summaryVersion: 2
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
                console.log(`○ [${article.source.name}] ${article.title.substring(0, 40)}... (日本語要約あり、スキップ)`);
                generatedCount++;
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
            
            console.log(`✓ [${article.source.name}] ${article.title.substring(0, 40)}... (タグ: ${tags.join(', ')})`);
            generatedCount++;
            apiStats.successes++;
              break; // 成功したらループを抜ける
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              
              if ((errorMessage.includes('503') || errorMessage.includes('overloaded')) && retryCount < MAX_RETRIES - 1) {
                retryCount++;
                apiStats.overloadErrors++;
                
                // エクスポネンシャルバックオフ: 10秒 → 20秒 → 40秒
                const waitTime = 10000 * Math.pow(2, retryCount - 1);
                console.log(`  リトライ ${retryCount}/${MAX_RETRIES} - ${waitTime/1000}秒待機中...`);
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
    
    console.log(`\n📊 要約とタグ生成完了:`);
    console.log(`   成功: ${generatedCount}件`);
    console.log(`   エラー: ${errorCount}件`);
    console.log(`   処理時間: ${duration}秒`);

    // 要約が生成された場合はキャッシュを無効化
    if (generatedCount > 0) {
      console.log('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
    }
    console.log(`\n📈 API統計:`);
    console.log(`   総試行回数: ${apiStats.attempts}`);
    console.log(`   成功: ${apiStats.successes}`);
    console.log(`   失敗: ${apiStats.failures}`);
    console.log(`   503エラー: ${apiStats.overloadErrors}`);
    console.log(`   成功率: ${successRate}%`);
    console.log(`   実行時間: ${totalDuration}秒`);
    
    // 成功率が低い場合は警告
    if (successRate < 50 && apiStats.attempts > 10) {
      console.log(`\n⚠️  警告: API成功率が${successRate}%と低いです。深夜の実行を推奨します。`);
    }

    return { generated: generatedCount, errors: errorCount };

  } catch (error) {
    console.error('❌ 要約生成エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  generateSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { generateSummaries };