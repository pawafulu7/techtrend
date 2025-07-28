import { PrismaClient, Article, Source } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

interface GenerateResult {
  generated: number;
  errors: number;
}

interface SummaryAndTags {
  summary: string;
  tags: string[];
}

async function generateSummaryAndTags(title: string, content: string): Promise<SummaryAndTags> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `以下の技術記事を詳細に分析してください。

タイトル: ${title}
内容: ${content.substring(0, 3000)}

以下の観点で分析し、指定された形式で回答してください：

【分析観点】
1. 記事の主要なトピックと技術的な焦点
2. 解決しようとしている問題や課題
3. 提示されている解決策やアプローチ
4. 実装の具体例やコードの有無
5. 対象読者のレベル（初級/中級/上級）

【回答形式】

要約: [60-80文字の日本語で、以下の要素を含めて簡潔にまとめる]
- 何について説明しているか（主題）
- どのような問題を解決するか、または何を実現するか
- 重要な技術やツールがあれば言及
- 著者の自己紹介や前置きは除外
- 必ず「。」で終わる

タグ: [記事の内容を正確に表す技術タグを3-5個、カンマ区切りで記載]
- 使用されている主要な技術・言語・フレームワーク
- 記事のカテゴリ（例: フロントエンド, バックエンド, インフラ, セキュリティ, AI/ML）
- 具体的な技術概念（例: 非同期処理, 状態管理, CI/CD, マイクロサービス）
- 一般的な技術用語を使用（JavaScript→JavaScript, typescript→TypeScript）
- 取得元情報はタグに含めない

【タグの例】
- プログラミング言語: JavaScript, TypeScript, Python, Go, Rust, Ruby, Java
- フレームワーク: React, Vue.js, Next.js, Django, Express, Spring Boot
- インフラ/クラウド: AWS, Docker, Kubernetes, Terraform, CI/CD
- 概念: API設計, パフォーマンス最適化, セキュリティ, テスト, アーキテクチャ`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 300,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  return parseSummaryAndTags(responseText);
}

function parseSummaryAndTags(text: string): SummaryAndTags {
  const lines = text.split('\n');
  let summary = '';
  let tags: string[] = [];

  for (const line of lines) {
    if (line.startsWith('要約:') || line.startsWith('要約：')) {
      summary = line.replace(/^要約[:：]\s*/, '').trim();
      // 要約のクリーンアップ
      summary = summary
        .replace(/^(本記事は|本稿では|記事では|この記事は)/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    } else if (line.startsWith('タグ:') || line.startsWith('タグ：')) {
      const tagLine = line.replace(/^タグ[:：]\s*/, '');
      tags = tagLine.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 30)
        .map(tag => normalizeTag(tag));
    }
  }

  // フォールバック
  if (!summary) {
    summary = text.substring(0, 100);
  }

  return { summary, tags };
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
      // 「。」で終わらない、または200文字で切れている要約
      return !summary.endsWith('。') || summary.length === 200 || summary.length === 203;
    });

    // すべての対象記事を結合
    const allArticlesToProcess = [
      ...articlesWithoutSummary,
      ...articlesWithEnglishSummary,
      ...truncatedArticles
    ];

    // 重複を除去
    const uniqueArticles = Array.from(
      new Map(allArticlesToProcess.map(a => [a.id, a])).values()
    );

    if (uniqueArticles.length === 0) {
      console.log('✅ すべての記事が適切な要約を持っています');
      return { generated: 0, errors: 0 };
    }

    console.log(`📄 処理対象の記事数:`);
    console.log(`   - 要約なし: ${articlesWithoutSummary.length}件`);
    console.log(`   - 英語要約: ${articlesWithEnglishSummary.length}件`);
    console.log(`   - 途切れた要約: ${truncatedArticles.length}件`);
    console.log(`   - 合計（重複除去後）: ${uniqueArticles.length}件`);

    let generatedCount = 0;
    let errorCount = 0;
    const batchSize = 3; // API制限を考慮して並列数を調整

    // バッチ処理で要約を生成
    for (let i = 0; i < uniqueArticles.length; i += batchSize) {
      const batch = uniqueArticles.slice(i, i + batchSize);
      console.log(`\n処理中: ${i + 1}-${Math.min(i + batchSize, uniqueArticles.length)}件目`);

      await Promise.all(
        batch.map(async (article) => {
          try {
            const content = article.content || article.description || '';
            const { summary, tags } = await generateSummaryAndTags(article.title, content);
            
            // 要約を更新
            await prisma.article.update({
              where: { id: article.id },
              data: { summary }
            });

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
          } catch (error) {
            console.error(`✗ [${article.source.name}] ${article.title.substring(0, 40)}...`);
            console.error(`  エラー: ${error instanceof Error ? error.message : String(error)}`);
            errorCount++;
          }
        })
      );

      // API レート制限対策
      if (i + batchSize < uniqueArticles.length) {
        await sleep(2000);
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n📊 要約とタグ生成完了: 成功${generatedCount}件, エラー${errorCount}件 (${duration}秒)`);

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