import { Article, Source, Tag } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import fetch from 'node-fetch';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { getOrCreateTags } from '@/lib/services/tag-service';
import { env } from '@/lib/config/env';

type ArticleWithSourceAndTags = Article & {
  source: Source;
  tags: Tag[];
};

interface GenerateResult {
  generated: number;
  errors: number;
}

// タグ生成用の関数（要約生成から分離）
async function generateTags(title: string, content: string): Promise<string[]> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const model = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
  let data: any;
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200,
        }
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }
    data = await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini API request timed out after 30s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  // タグの抽出
  const tagLine = responseText.replace(/^タグ[:：]\s*/, '');
  const tags = tagLine.split(/[,、，]/)
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0 && tag.length <= 30);

  return tags;
}

async function generateTagsForArticles(): Promise<GenerateResult> {
  console.error('🏷️ タグ生成バッチを開始します...');
  const startTime = Date.now();

  try {
    // 1. タグがない記事を取得
    const articlesWithoutTags = await prisma.article.findMany({
      where: {
        tags: {
          none: {}
        }
      },
      include: { source: true, tags: true },
      orderBy: { publishedAt: 'desc' },
      take: 25  // API負荷を考慮して25件に制限
    }) as ArticleWithSourceAndTags[];

    // 2. 「article」タグのみの記事を取得
    const articlesWithOnlyArticleTag = await prisma.article.findMany({
      where: {
        tags: {
          every: { name: 'article' },
          some: { name: 'article' }
        }
      },
      include: { source: true, tags: true },
      orderBy: { publishedAt: 'desc' },
      take: 25
    }) as ArticleWithSourceAndTags[];

    // 「article」タグのみの記事をフィルタリング
    const singleArticleTagArticles = articlesWithOnlyArticleTag.filter(
      article => article.tags.length === 1
    );

    // 対象記事を結合（重複除去）
    const allArticles = [
      ...articlesWithoutTags,
      ...singleArticleTagArticles
    ];

    const uniqueArticles = Array.from(
      new Map(allArticles.map(a => [a.id, a])).values()
    );

    if (uniqueArticles.length === 0) {
      console.error('✅ タグ生成が必要な記事はありません');
      return { generated: 0, errors: 0 };
    }

    console.error(`📊 処理対象:`);
    console.error(`   - タグなし: ${articlesWithoutTags.length}件`);
    console.error(`   - 「article」タグのみ: ${singleArticleTagArticles.length}件`);
    console.error(`   - 合計: ${uniqueArticles.length}件`);

    let generatedCount = 0;
    let errorCount = 0;

    // 記事ごとにタグを生成
    for (const article of uniqueArticles) {
      try {
        const content = article.content || article.summary || '';
        
        // タグを生成
        const tags = await generateTags(article.title, content);
        
        if (tags.length > 0) {
          // AI生成タグのみ正規化（既存タグはDB上の名前を維持 — 'article'等の特殊タグ保護）
          const newTagRecords = await getOrCreateTags(tags, { normalize: true, maxTags: 30 });

          // 更新直前に現在のタグを読み、追加分のみconnect（staleスナップショット書き戻し防止）
          await prisma.$transaction(async (tx) => {
            const current = await tx.article.findUniqueOrThrow({
              where: { id: article.id },
              select: { tags: { select: { id: true } } }
            });

            const currentTagIdSet = new Set(current.tags.map(t => t.id));
            const tagsToConnect = newTagRecords
              .filter(t => !currentTagIdSet.has(t.id))
              .map(t => ({ id: t.id }));

            if (tagsToConnect.length > 0) {
              await tx.article.update({
                where: { id: article.id },
                data: {
                  tags: {
                    connect: tagsToConnect
                  }
                }
              });
            }
          });
          
          console.error(`✓ [${article.source.name}] ${article.title.substring(0, 40)}... (タグ: ${tags.join(', ')})`);
          generatedCount++;
        }
        
        // APIレート制限対策
        await sleep(2000);  // 2秒待機
        
      } catch (error) {
        console.error(`✗ [${article.source.name}] ${article.title.substring(0, 40)}...`);
        console.error(`  エラー: ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
        await sleep(2000);  // エラー連続時のAPI連打防止
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n📊 タグ生成完了:`);
    console.error(`   成功: ${generatedCount}件`);
    console.error(`   エラー: ${errorCount}件`);
    console.error(`   処理時間: ${duration}秒`);

    // タグが生成された場合はキャッシュを無効化
    if (generatedCount > 0) {
      console.error('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
    }

    return { generated: generatedCount, errors: errorCount };

  } catch (error) {
    console.error('❌ タグ生成エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 直接実行された場合
if (require.main === module) {
  generateTagsForArticles()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { generateTagsForArticles };