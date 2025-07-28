import { PrismaClient, Article, Source } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

interface TagGenerationResult {
  processed: number;
  errors: number;
}

async function generateTags(title: string, content: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `以下の技術記事からタグを生成してください。

タイトル: ${title}
内容: ${content.substring(0, 2000)}

記事に関連する技術タグを最大5個、カンマ区切りで記載してください。
具体的な技術名、言語、フレームワーク、概念などを含めてください。

タグ: [例: JavaScript, React, パフォーマンス, フロントエンド, 最適化]

注意事項：
- タグは一般的な技術用語を使用（JavaScript, TypeScript, Python, React, Vue.js, Docker, Kubernetes, AI, 機械学習など）
- 固有名詞は適切に大文字小文字を区別（JavaScript, TypeScript, GitHub, AWS など）
- 日本語タグも適切に使用（機械学習, セキュリティ, パフォーマンス など）
- 取得元情報（AWS News Blog, Qiitaなど）はタグに含めない`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 150,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  return parseTags(responseText);
}

function parseTags(text: string): string[] {
  const lines = text.split('\n');
  let tags: string[] = [];

  for (const line of lines) {
    if (line.startsWith('タグ:') || line.startsWith('タグ：') || line.includes(':')) {
      const tagLine = line.replace(/^.*[:：]\s*/, '');
      tags = tagLine.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 30)
        .map(tag => normalizeTag(tag));
      break;
    }
  }

  // フォールバックとして全文から抽出
  if (tags.length === 0) {
    tags = text.split(/[,、，]/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.length <= 30 && !tag.includes(' '))
      .map(tag => normalizeTag(tag))
      .slice(0, 5);
  }

  return tags;
}

function normalizeTag(tag: string): string {
  const tagNormalizationMap: Record<string, string> = {
    'javascript': 'JavaScript',
    'js': 'JavaScript',
    'typescript': 'TypeScript',
    'ts': 'TypeScript',
    'react': 'React',
    'vue': 'Vue.js',
    'angular': 'Angular',
    'node': 'Node.js',
    'nodejs': 'Node.js',
    'python': 'Python',
    'docker': 'Docker',
    'kubernetes': 'Kubernetes',
    'k8s': 'Kubernetes',
    'aws': 'AWS',
    'gcp': 'GCP',
    'azure': 'Azure',
    'ai': 'AI',
    'ml': '機械学習',
    'github': 'GitHub',
    'git': 'Git',
  };

  const lowerTag = tag.toLowerCase();
  return tagNormalizationMap[lowerTag] || tag;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type ArticleWithSourceAndTags = Article & { 
  source: Source;
  tags: { id: string; name: string }[];
};

async function generateTagsForExisting(): Promise<TagGenerationResult> {
  console.log('🏷️  既存記事のタグ生成を開始します...');
  const startTime = Date.now();

  try {
    // タグがない記事を取得（要約がある記事を優先）
    const articlesWithoutTags = await prisma.article.findMany({
      where: {
        tags: {
          none: {}
        },
        summary: {
          not: null
        }
      },
      include: { 
        source: true,
        tags: true
      },
      orderBy: { publishedAt: 'desc' },
      take: 50  // 一度に処理する記事数を制限
    }) as ArticleWithSourceAndTags[];

    if (articlesWithoutTags.length === 0) {
      console.log('✅ すべての記事にタグが付いています');
      return { processed: 0, errors: 0 };
    }

    console.log(`📄 処理対象の記事数: ${articlesWithoutTags.length}件`);

    let processedCount = 0;
    let errorCount = 0;
    const batchSize = 3; // API制限を考慮して並列数を調整

    // バッチ処理でタグを生成
    for (let i = 0; i < articlesWithoutTags.length; i += batchSize) {
      const batch = articlesWithoutTags.slice(i, i + batchSize);
      console.log(`\n処理中: ${i + 1}-${Math.min(i + batchSize, articlesWithoutTags.length)}件目`);

      await Promise.all(
        batch.map(async (article) => {
          try {
            // 要約またはコンテンツからタグを生成
            const textForAnalysis = article.summary || article.content || article.title;
            const tags = await generateTags(article.title, textForAnalysis);
            
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

              console.log(`✓ [${article.source.name}] ${article.title.substring(0, 40)}... (タグ: ${tags.join(', ')})`);
              processedCount++;
            } else {
              console.log(`⚠ [${article.source.name}] ${article.title.substring(0, 40)}... (タグなし)`);
            }
          } catch (error) {
            console.error(`✗ [${article.source.name}] ${article.title.substring(0, 40)}...`);
            console.error(`  エラー: ${error instanceof Error ? error.message : String(error)}`);
            errorCount++;
          }
        })
      );

      // API レート制限対策
      if (i + batchSize < articlesWithoutTags.length) {
        await sleep(2000);
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n📊 タグ生成完了: 成功${processedCount}件, エラー${errorCount}件 (${duration}秒)`);

    // 統計情報を表示
    const totalArticles = await prisma.article.count();
    const articlesWithTags = await prisma.article.count({
      where: {
        tags: {
          some: {}
        }
      }
    });

    console.log(`\n【更新後の統計】`);
    console.log(`- タグ付き記事: ${articlesWithTags}/${totalArticles} (${((articlesWithTags / totalArticles) * 100).toFixed(1)}%)`);

    return { processed: processedCount, errors: errorCount };

  } catch (error) {
    console.error('❌ タグ生成エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  generateTagsForExisting()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { generateTagsForExisting };