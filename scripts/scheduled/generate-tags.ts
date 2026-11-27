import { Article, Source, Tag } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import fetch from 'node-fetch';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { getOrCreateTags } from '@/lib/tags/tag-service';
import { env } from '@/lib/config/env';
import { buildGeminiEndpoint } from '@/scripts/lib/gemini-endpoint';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { GeminiCallTally } from '@/lib/ai/gemini-call-tally';
import { extractApiStatus } from '@/lib/ai/transport/gemini-transport';

type ArticleWithSourceAndTags = Article & {
  source: Source;
  tags: Tag[];
};

/** generateContent の応答のうち、ここで読む部分 */
type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown }> };
    finishReason?: unknown;
  }>;
  promptFeedback?: { blockReason?: unknown };
};

interface GenerateResult {
  generated: number;
  errors: number;
  /** Gemini の呼び出しが 1 件も届かずに失敗だけが出たか（lib/ai/gemini-call-tally.ts） */
  allGeminiCallsFailed: boolean;
}

// タグ生成用の関数（要約生成から分離）
async function generateTags(
  title: string,
  content: string,
  tally: GeminiCallTally
): Promise<string[]> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  // モデルID・ベースURLは共通ヘルパーから解決する（直書きしない）
  const apiUrl = buildGeminiEndpoint(apiKey);

  const prompt = `以下の技術記事から適切なタグを生成してください。

タイトル: ${title}
内容: ${content.substring(0, 3000)}

以下の形式で、カンマ区切りで5-10個のタグを出力してください：
- プログラミング言語名（JavaScript, Python, Go など）
- フレームワーク名（React, Django, Spring など）
- 技術カテゴリ（Frontend, Backend, DevOps, AI など）
- ツール名（Docker, Kubernetes, Git など）

タグ: `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    // 応答が返ったか（HTTP エラー・タイムアウト・通信の失敗でないか）を数える
    response = await tally.track(async () => {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 200,
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errorText = await res.text();
        // 本文は message に入れない（403 などの本文には API の利用先の識別子が入りうる）。
        // HTTP の状態と状態名（NOT_FOUND など）を持たせ、公開されるログにも出す（summarizeError）
        throw Object.assign(new Error(`API request failed: ${res.status}`), {
          status: res.status,
          code: extractApiStatus(errorText),
        });
      }
      return res;
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini API request timed out after 30s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  const data = (await response.json()) as GeminiGenerateResponse;
  // 依頼が安全性のフィルタで止められると、HTTP 200 で候補が 1 件も返らない
  // （promptFeedback.blockReason。性犯罪の報道などで PROHIBITED_CONTENT になる）。
  // 理由は決まった形の値なので code に入れ、公開されるログにも出す（summarizeError）
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    const reason = data.promptFeedback?.blockReason ?? candidate?.finishReason;
    throw Object.assign(new Error('Gemini returned no text'), {
      code: typeof reason === 'string' ? reason : 'NO_TEXT',
    });
  }
  const responseText = text.trim();

  // タグの抽出
  const tagLine = responseText.replace(/^タグ[:：]\s*/, '');
  const tags = tagLine
    .split(/[,、，]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= 30);

  return tags;
}

async function generateTagsForArticles(): Promise<GenerateResult> {
  console.error('🏷️ タグ生成バッチを開始します...');
  const startTime = Date.now();

  try {
    // キーが無いと全記事が失敗するのに、Gemini を呼ばないので呼び出しの集計では気づけない。
    // 先に止めて失敗で終える（scripts/scheduled/manage-summaries.ts と同じ）
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    // 1. タグがない記事を取得
    const articlesWithoutTags = (await prisma.article.findMany({
      where: {
        tags: {
          none: {},
        },
      },
      include: { source: true, tags: true },
      orderBy: { publishedAt: 'desc' },
      take: 25, // API負荷を考慮して25件に制限
    })) as ArticleWithSourceAndTags[];

    // 2. 「article」タグのみの記事を取得
    const articlesWithOnlyArticleTag = (await prisma.article.findMany({
      where: {
        tags: {
          every: { name: 'article' },
          some: { name: 'article' },
        },
      },
      include: { source: true, tags: true },
      orderBy: { publishedAt: 'desc' },
      take: 25,
    })) as ArticleWithSourceAndTags[];

    // 「article」タグのみの記事をフィルタリング
    const singleArticleTagArticles = articlesWithOnlyArticleTag.filter(
      (article) => article.tags.length === 1
    );

    // 対象記事を結合（重複除去）
    const allArticles = [...articlesWithoutTags, ...singleArticleTagArticles];

    const uniqueArticles = Array.from(
      new Map(allArticles.map((a) => [a.id, a])).values()
    );

    if (uniqueArticles.length === 0) {
      console.error('✅ タグ生成が必要な記事はありません');
      return { generated: 0, errors: 0, allGeminiCallsFailed: false };
    }

    console.error(`📊 処理対象:`);
    console.error(`   - タグなし: ${articlesWithoutTags.length}件`);
    console.error(
      `   - 「article」タグのみ: ${singleArticleTagArticles.length}件`
    );
    console.error(`   - 合計: ${uniqueArticles.length}件`);

    let generatedCount = 0;
    let errorCount = 0;
    const tally = new GeminiCallTally();

    // 記事ごとにタグを生成
    for (const article of uniqueArticles) {
      try {
        const content = article.content || article.summary || '';

        // タグを生成
        const tags = await generateTags(article.title, content, tally);

        if (tags.length > 0) {
          // 更新直前に現在のタグを読み、追加分のみconnect（staleスナップショット書き戻し防止）
          // getOrCreateTagsをtx内に移動してタグupsertと記事更新をatomicに実行
          const connectedCount = await prisma.$transaction(async (tx) => {
            // AI生成タグのみ正規化（既存タグはDB上の名前を維持 — 'article'等の特殊タグ保護）
            const newTagRecords = await getOrCreateTags(
              tags,
              { normalize: true, maxTags: 30 },
              tx
            );

            const current = await tx.article.findUniqueOrThrow({
              where: { id: article.id },
              select: { tags: { select: { id: true } } },
            });

            const currentTagIdSet = new Set(current.tags.map((t) => t.id));
            const tagsToConnect = newTagRecords
              .filter((t) => !currentTagIdSet.has(t.id))
              .map((t) => ({ id: t.id }));

            if (tagsToConnect.length > 0) {
              await tx.article.update({
                where: { id: article.id },
                data: {
                  tags: {
                    connect: tagsToConnect,
                  },
                },
              });
            }

            return tagsToConnect.length;
          });

          if (connectedCount > 0) {
            console.error(
              `✓ [${article.source.name}] ${article.title.substring(0, 40)}... (タグ: ${tags.join(', ')})`
            );
            generatedCount++;
          }
        }

        // APIレート制限対策
        await sleep(2000); // 2秒待機
      } catch (error) {
        console.error(
          `✗ [${article.source.name}] ${article.title.substring(0, 40)}...`
        );
        console.error(`  エラー: ${summarizeError(error)}`);
        errorCount++;
        await sleep(2000); // エラー連続時のAPI連打防止
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n📊 タグ生成完了:`);
    console.error(`   成功: ${generatedCount}件`);
    console.error(`   エラー: ${errorCount}件`);
    console.error(`   処理時間: ${duration}秒`);
    console.error(`   ${tally.summary()}`);

    // タグが生成された場合はキャッシュを無効化
    if (generatedCount > 0) {
      console.error('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
    }

    return {
      generated: generatedCount,
      errors: errorCount,
      allGeminiCallsFailed: tally.allFailed,
    };
  } catch (error) {
    console.error('❌ タグ生成エラー:', summarizeError(error, { stack: true }));
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 直接実行された場合
if (require.main === module) {
  generateTagsForArticles()
    .then((result) => {
      // Gemini の呼び出しが 1 件も届かなかった回は失敗で終え、ワークフローの通知に載せる
      if (result.allGeminiCallsFailed) {
        console.error('❌ Gemini の呼び出しがすべて失敗しました');
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error(summarizeError(error, { stack: true }));
      process.exit(1);
    });
}

export { generateTagsForArticles };
