import { PrismaClient, Article, Source } from '@prisma/client';
import fetch from 'node-fetch';
import { normalizeTag, normalizeTags } from '@/lib/utils/tag-normalizer';
// import { detectArticleType } from '@/lib/utils/article-type-detector';  // 統一プロンプト移行により無効化
// import { generatePromptForArticleType } from '@/lib/utils/article-type-prompts';  // 統一プロンプト移行により無効化
import { generateUnifiedPrompt } from '@/lib/utils/article-type-prompts';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { isDeletedContent } from '@/lib/utils/content-validator';
import { isUrlFromDomain } from '@/lib/utils/url-validator';
import {
  checkSummaryQuality,
  isQualityCheckEnabled,
  getMaxRegenerationAttempts,
  generateQualityReport,
  expandSummaryIfNeeded
} from '@/lib/utils/summary-quality-checker';
import { generateSummaryWithRetry } from '@/lib/ai/summary-generator';
import { CategoryClassifier } from '@/lib/services/category-classifier';

import { SUMMARY_VERSION } from '@/types/article';
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
  regenerations: 0,
  qualityIssues: {
    length: 0,
    truncation: 0,
    thinContent: 0,
    languageMix: 0,
    format: 0
  },
  startTime: Date.now()
};

async function generateSummaryAndTags(title: string, content: string, isRegeneration: boolean = false): Promise<SummaryAndTags> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  // 統一プロンプトを使用（記事タイプ判定を廃止）
  const prompt = generateUnifiedPrompt(title, content);
  const articleType = 'unified';  // 統一タイプを設定

  apiStats.attempts++;

  // AbortControllerでタイムアウト設定（30秒）
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let responseText: string;
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
          maxOutputTokens: 2500,  // 詳細要約に対応した統一設定
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    responseText = data.candidates[0].content.parts[0].text.trim();
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('API request timeout after 30 seconds');
    }
    throw error;
  }

  // デバッグログ追加（Phase 1）
  const DEBUG_SUMMARIES = process.env.DEBUG_SUMMARIES === 'true';
  if (DEBUG_SUMMARIES) {
    console.error('\n========== API Response Debug ==========');
    console.error('Title:', title);
    console.error('Response Text Length:', responseText.length);
    console.error('First 500 chars:', responseText.substring(0, 500));
    console.error('========================================\n');
  }
  
  const result = parseSummaryAndTags(responseText, title, content);
  
  // デバッグログ追加（パース後）
  if (DEBUG_SUMMARIES) {
    console.error('\n========== Parse Result Debug ==========');
    console.error('Summary Length:', result.summary.length);
    console.error('Summary First 100:', result.summary.substring(0, 100));
    console.error('Detailed Summary Length:', result.detailedSummary.length);
    console.error('Detailed Summary First 100:', result.detailedSummary.substring(0, 100));
    console.error('Are they same?:', result.summary === result.detailedSummary);
    console.error('Are first 100 chars same?:', result.summary.substring(0, 100) === result.detailedSummary.substring(0, 100));
    console.error('========================================\n');
  }
  
  // 新しい品質チェックシステムを使用
  const qualityCheck = checkSummaryQuality(result.summary, result.detailedSummary);
  
  // 品質問題をトラッキング
  qualityCheck.issues.forEach(issue => {
    if (issue.type === 'length') apiStats.qualityIssues.length++;
    if (issue.type === 'format') apiStats.qualityIssues.format++;
    if (issue.type === 'punctuation') apiStats.qualityIssues.truncation++;  // 句点問題として記録
  });
  
  // 品質レポートを出力（デバッグ用）
  if (qualityCheck.issues.length > 0 && process.env.DEBUG === 'true') {
    console.error(generateQualityReport(qualityCheck));
  }
  
  // 再生成が必要な場合は例外をスロー
  if (qualityCheck.requiresRegeneration && !isRegeneration) {
    apiStats.regenerations++;
    const issueMessages = qualityCheck.issues.map(i => i.message).join(', ');
    throw new Error(`QUALITY_ISSUE: ${issueMessages}`);
  }
  
  return { ...result, articleType };
}

// テキストクリーンアップ関数
function cleanupText(text: string): string {
  return text
    .replace(/\*\*/g, '') // マークダウン除去
    .trim();
}

// Markdown太字記法を適切に削除する関数
function removeMarkdownBold(text: string): string {
  // **text** 形式のMarkdown太字を削除
  return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}

// 最終クリーンアップ関数
function finalCleanup(text: string): string {
  if (!text) return text;
  
  // 冒頭の重複ラベル除去（Phase 2: マークダウンラベル追加）
  const cleanupPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/,
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/,
    /^【?\d+-\d+文字.*?】?\s*/,  // プロンプト指示の除去
    /^【?簡潔にまとめ.*?】?\s*/,
    /^#{1,3}\s*要約[:：]\s*/,     // マークダウン形式の要約ラベル
    /^#{1,3}\s*詳細要約[:：]\s*/   // マークダウン形式の詳細要約ラベル
  ];
  
  cleanupPatterns.forEach(pattern => {
    text = text.replace(pattern, '');
  });
  
  // 枕詞の削除（本記事は、本稿では、など）
  text = text.replace(/^(本記事は、|本記事は|本稿では、|本稿では|記事では、|記事では|この記事は、|この記事は)/g, '');
  
  // 先頭の句読点を除去
  text = text.replace(/^[、。]\s*/, '');
  
  // 改行の正規化
  text = text.replace(/\n+/g, '\n').trim();
  
  // 文末に句点がない場合は追加（箇条書きの場合と、既に句点がある場合は除く）
  if (text && !text.includes('・') && !text.match(/[。！？]$/)) {
    // 末尾が「。」の連続になっていないことを確認
    if (!text.endsWith('。')) {
      text += '。';
    }
  }
  
  return text;
}

function parseSummaryAndTags(text: string, title: string = '', content: string = ''): SummaryAndTags {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let isDetailedSummary = false;
  let tagSectionStarted = false; // タグセクション開始フラグを追加
  
  // パターン定義（Phase 2: マークダウン形式追加）
  const summaryPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/,
    /^#{1,3}\s*要約[:：]\s*/      // マークダウン形式の要約ラベル
  ];
  
  const detailedSummaryPatterns = [
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/,
    /^#{1,3}\s*詳細要約[:：]\s*/   // マークダウン形式の詳細要約ラベル
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
  let expectingSummaryContent = false;  // 要約ラベル後の内容待ちフラグ
  let expectingDetailedContent = false;  // 詳細要約ラベル後の内容待ちフラグ

  for (const line of lines) {
    // プロンプト指示行をスキップ
    if (promptPatterns.some(pattern => pattern.test(line))) {
      continue;
    }
    
    // summary処理
    if (!summaryStarted && summaryPatterns.some(pattern => pattern.test(line))) {
      // ラベルを除去した後の行を取得
      let cleanedLine = line;
      summaryPatterns.forEach(pattern => {
        cleanedLine = cleanedLine.replace(pattern, '');
      });
      cleanedLine = cleanupText(cleanedLine);
      
      // 同じ行に要約がある場合はそれを使う
      if (cleanedLine.trim()) {
        summary = cleanedLine;
        expectingSummaryContent = false;
      } else {
        // ラベルのみの行の場合、次の非空行を待つ
        expectingSummaryContent = true;
      }
      summaryStarted = true;
      isDetailedSummary = false;
    }
    // 要約ラベル後の内容待ち
    else if (expectingSummaryContent && line.trim() && 
             !detailedSummaryPatterns.some(pattern => pattern.test(line)) && 
             !line.match(/^タグ[:：]/)) {
      summary = cleanupText(line);
      expectingSummaryContent = false;
    }
    // summaryの続きの行（空行が来るまで）
    else if (summaryStarted && !detailedSummaryStarted && line.trim() && 
             !detailedSummaryPatterns.some(pattern => pattern.test(line)) && 
             !line.match(/^タグ[:：]/)) {
      // 最初の行の場合は改行を追加しない
      if (summary) {
        summary += '\n' + cleanupText(line);
      } else {
        summary = cleanupText(line);
      }
    }
    // detailedSummary処理
    else if (detailedSummaryPatterns.some(pattern => pattern.test(line))) {
      // ラベルを除去した後の行を取得
      let cleanedLine = line;
      detailedSummaryPatterns.forEach(pattern => {
        cleanedLine = cleanedLine.replace(pattern, '');
      });
      cleanedLine = cleanupText(cleanedLine);
      
      // 同じ行に詳細要約がある場合はそれを使う
      if (cleanedLine.trim()) {
        detailedSummary = cleanedLine;
        expectingDetailedContent = false;
      } else {
        // ラベルのみの行の場合、次の非空行を待つ
        expectingDetailedContent = true;
      }
      detailedSummaryStarted = true;
      isDetailedSummary = true;
    }
    // 詳細要約ラベル後の内容待ち
    else if (expectingDetailedContent && line.trim() && !line.match(/^タグ[:：]/)) {
      // 箇条書きの場合もMarkdown削除を適用
      if (line.trim().startsWith('・')) {
        detailedSummary = removeMarkdownBold(line.trim());
      } else {
        detailedSummary = cleanupText(line);
      }
      expectingDetailedContent = false;
      isDetailedSummary = true;
    }
    // detailedSummaryの続きの行
    else if (isDetailedSummary && line.trim() && !line.match(/^タグ[:：]/)) {
      // 箇条書きの場合もMarkdown削除を適用
      if (line.trim().startsWith('・')) {
        // 最初の行の場合は改行を追加しない
        const cleanedLine = removeMarkdownBold(line.trim());
        if (detailedSummary) {
          detailedSummary += '\n' + cleanedLine;
        } else {
          detailedSummary = cleanedLine;
        }
      } else {
        // 最初の行の場合は改行を追加しない
        if (detailedSummary) {
          detailedSummary += '\n' + cleanupText(line);
        } else {
          detailedSummary = cleanupText(line);
        }
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
  
  // 冒頭に「要約:」が残っている場合は削除（改行を含む場合も対応）
  summary = summary.replace(/^要約[:：]\s*\n?/, '').trim();
  detailedSummary = detailedSummary.replace(/^詳細要約[:：]\s*\n?/, '').trim();
  
  // Phase 2: 一覧要約と詳細要約が同じ場合の対処
  if (summary && detailedSummary && summary === detailedSummary) {
    console.warn('⚠️ 警告: 一覧要約と詳細要約が同一です。詳細要約を再生成が必要です。');
    // 詳細要約をリセットしてフォールバック処理に任せる
    detailedSummary = '';
  }
  
  // Phase 2: 文字数拡張処理を無効化（タイトルをそのまま使う問題があるため）
  // summary = expandSummaryIfNeeded(summary, title, 150, content || text);
  // expandSummaryIfNeededは要約が空の場合「タイトルに関する内容」を返すため無効化
  
  // フォールバック
  if (!summary) {
    // 最初の「要約:」以外の行を探して使用
    const cleanLines = text.split('\n').filter(line => !line.match(/^(要約|詳細要約)[:：]/));
    summary = cleanLines.join(' ').substring(0, 150);
  }
  if (!detailedSummary) {
    const cleanLines = text.split('\n').filter(line => !line.match(/^(要約|詳細要約)[:：]/));
    detailedSummary = cleanLines.join(' ').substring(0, 300);
  }

  return { summary, detailedSummary, tags, articleType: 'unified' };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type ArticleWithSource = Article & { source: Source; description?: string | null };

async function generateSummaries(): Promise<GenerateResult> {
  console.error('📝 要約とタグの生成を開始します...');
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
              
              // コンテンツが100文字未満の記事はスキップ
              if (content.length < 100) {
                console.error(`  ⏭️ スキップ: ${article.title} (コンテンツ不足: ${content.length}文字)`);
                break;
              }
              
              // 削除メッセージを含む記事はスキップ
              if (isDeletedContent(content)) {
                console.error(`  ⏭️ スキップ: ${article.title} (削除メッセージを検出)`);
                break; // このarticleの処理をスキップ
              }
              
              // はてなブックマーク経由の外部サイト記事でコンテンツ不足の場合はスキップ
              if (article.source.name === 'はてなブックマーク' &&
                  content.length < 300 &&
                  (isUrlFromDomain(article.url, 'speakerdeck.com') ||
                   isUrlFromDomain(article.url, 'slideshare.net'))) {
                console.error(`  ⏭️ スキップ: ${article.title} (はてなブックマーク経由の外部サイト記事でコンテンツ不足)`);
                break; // このarticleの処理をスキップ
              }
              
              // スライドサービス（Speaker DeckとDocswell）の記事はスキップ（サムネイル表示のみ）
              if (article.source.name === 'Speaker Deck' || article.source.name === 'Docswell') {
                console.error(`  ⏭️ スキップ: ${article.title} (${article.source.name}記事はサムネイル表示のみ)`);
                break; // このarticleの処理をスキップ
              }
              
              // 既に日本語の要約がある場合はスキップ（Gemini APIを呼ばない）
              const existingSummary = article.summary || '';
              const hasJapaneseSummary = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(existingSummary);
              
              let summary = existingSummary;
              let tags: string[] = [];
              
              // 日本語要約がない場合のみGemini APIを呼び出す
              if (!hasJapaneseSummary || !article.summary || !article.detailedSummary) {
                let result: SummaryAndTags;
                let regenerationCount = 0;
                const MAX_REGENERATIONS = parseInt(process.env.MAX_REGENERATION_ATTEMPTS || '3');
                
                // 品質問題がある場合は再生成を試みる
                while (regenerationCount <= MAX_REGENERATIONS) {
                  try {
                    result = await generateSummaryAndTags(
                      article.title, 
                      content,
                      regenerationCount > 0  // 2回目以降は再生成フラグを立てる
                    );
                    
                    // 品質チェック（新システムを使用）
                    if (isQualityCheckEnabled()) {
                      const qualityCheck = checkSummaryQuality(
                        result.summary, 
                        result.detailedSummary
                      );
                      
                      // 品質基準を満たさない場合は再生成
                      if (qualityCheck.requiresRegeneration && regenerationCount < MAX_REGENERATIONS) {
                        regenerationCount++;
                        apiStats.regenerations++;
                        console.error(`  ⚠️ 品質スコア: ${qualityCheck.score}/100`);
                        console.error(`  再生成中 (${regenerationCount}/${MAX_REGENERATIONS})...`);
                        console.error(generateQualityReport(qualityCheck));
                        await sleep(1000); // API負荷軽減
                        continue;
                      }
                    }
                    
                    break; // 品質問題がなければループを抜ける
                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    if (errorMessage.startsWith('QUALITY_ISSUE:') && regenerationCount < MAX_REGENERATIONS) {
                      regenerationCount++;
                      console.error(`  品質問題検出: ${errorMessage.replace('QUALITY_ISSUE: ', '')}`);
                      console.error(`  再生成中 (${regenerationCount}/${MAX_REGENERATIONS})...`);
                      await sleep(1000); // API負荷軽減
                      continue;
                    }
                    throw error; // その他のエラーはそのままスロー
                  }
                }
                
                summary = result!.summary;
                tags = result!.tags;
                
                // 要約を更新（統一プロンプト版として保存）
                await prisma.article.update({
                  where: { id: article.id },
                  data: { 
                    summary,
                    detailedSummary: result!.detailedSummary,
                    articleType: 'unified',  // 統一タイプを設定
                    summaryVersion: SUMMARY_VERSION.UNIFIED  // 統一プロンプト版のバージョン
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
                  generatedCount++;
                  return;
                }
              }

              // タグを処理
              if (tags.length > 0) {
                // upsertパターンでタグを作成（race conditionを防ぐ）
                const tagRecords = await Promise.all(
                  tags.map(async (tagName) => {
                    return await prisma.tag.upsert({
                      where: { name: tagName },
                      update: {},  // 既存の場合は何も更新しない
                      create: { name: tagName }
                    });
                  })
                );

                // カテゴリを自動分類（classify メソッドを使用してより良い分類）
                const category = CategoryClassifier.classify(tagRecords, article.title, content);

                // 記事にタグとカテゴリを関連付ける
                await prisma.article.update({
                  where: { id: article.id },
                  data: {
                    tags: {
                      connect: tagRecords.map(tag => ({ id: tag.id }))
                    },
                    ...(category && { category })  // カテゴリが判定できた場合のみ更新
                  }
                });
                
                // ログでは計算されたカテゴリ値を表示（article.categoryではなくcategory変数を使用）
                console.error(`✓ [${article.source.name}] ${article.title.substring(0, 40)}... (タグ: ${tags.join(', ')}, カテゴリ: ${category || '未分類'})`);
              } else {
                // タグがない場合のログ
                console.error(`✓ [${article.source.name}] ${article.title.substring(0, 40)}...`);
              }
              
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
    console.error(`   再生成回数: ${apiStats.regenerations}`);
    console.error(`   実行時間: ${totalDuration}秒`);
    
    console.error(`\n📊 品質問題の内訳:`);
    console.error(`   文字数問題: ${apiStats.qualityIssues.length}件`);
    console.error(`   途切れ: ${apiStats.qualityIssues.truncation}件`);
    console.error(`   内容薄い: ${apiStats.qualityIssues.thinContent}件`);
    console.error(`   英語混入: ${apiStats.qualityIssues.languageMix}件`);
    console.error(`   形式問題: ${apiStats.qualityIssues.format}件`);
    
    // 成功率が低い場合は警告
    if (successRate < 50 && apiStats.attempts > 10) {
      console.error(`\n⚠️  警告: API成功率が${successRate}%と低いです。深夜の実行を推奨します。`);
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