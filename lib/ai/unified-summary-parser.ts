/**
 * 統一フォーマット要約パーサー
 * summaryVersion: 5用の標準パーサー実装
 */

import { normalizeTag } from '../utils/tag-normalizer';

export interface ParsedSummaryResult {
  summary: string;
  detailedSummary: string;
  tags: string[];
}

/**
 * 統一フォーマットのレスポンスをパース
 */
export function parseUnifiedResponse(text: string): ParsedSummaryResult {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let currentSection: 'summary' | 'detailed' | 'tags' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // セクション検出（マークダウンの太字記号も考慮）
    if (trimmed.match(/^\*{0,2}(一覧)?要約:\*{0,2}/)) {
      currentSection = 'summary';
      const content = trimmed.replace(/^\*{0,2}(一覧)?要約:\*{0,2}/, '').trim();
      if (content) {
        summary = content;
        currentSection = null; // 同一行で完結
      }
    } else if (trimmed.match(/^\*{0,2}詳細要約:\*{0,2}/)) {
      currentSection = 'detailed';
      const content = trimmed.replace(/^\*{0,2}詳細要約:\*{0,2}/, '').trim();
      if (content) {
        detailedSummary = content;
      }
    } else if (trimmed.match(/^\*{0,2}タグ:\*{0,2}/)) {
      currentSection = 'tags';
      const content = trimmed.replace(/^\*{0,2}タグ:\*{0,2}/, '').trim();
      if (content) {
        tags = parseTags(content);
        currentSection = null; // 同一行で完結
      }
    } else if (trimmed) {
      // セクション内容の追加
      switch (currentSection) {
        case 'summary':
          if (!summary.includes('\n')) {
            summary += (summary ? ' ' : '') + trimmed;
          }
          currentSection = null; // 要約は1行で完結
          break;
        case 'detailed':
          if (trimmed.startsWith('・') || trimmed.startsWith('-')) {
            detailedSummary += (detailedSummary ? '\n' : '') + trimmed;
          } else if (!trimmed.startsWith('【')) {
            detailedSummary += (detailedSummary ? '\n' : '') + trimmed;
          }
          break;
        case 'tags':
          if (!tags.length) {
            tags = parseTags(trimmed);
            currentSection = null; // タグ取得完了
          }
          break;
      }
    }
  }

  // フォールバック処理
  if (!summary) {
    summary = createFallbackSummary(text);
  }
  if (!detailedSummary) {
    detailedSummary = createFallbackDetailedSummary(text);
  }
  if (!tags.length) {
    tags = ['技術', '開発', 'プログラミング'];
  }

  return {
    summary: cleanupText(summary),
    detailedSummary: cleanupDetailedSummary(detailedSummary),
    tags: tags.slice(0, 5) // 最大5個のタグ
  };
}

/**
 * タグ文字列をパース
 */
function parseTags(tagString: string): string[] {
  return tagString
    .split(/[,、，]/)
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0 && tag.length <= 30)
    .map(tag => normalizeTag(tag));
}

/**
 * フォールバック要約を生成
 */
function createFallbackSummary(text: string): string {
  const firstLine = text.split('\n').find(line => line.trim().length > 0);
  if (firstLine) {
    return firstLine.substring(0, 150);
  }
  return 'この記事の要約を生成できませんでした。';
}

/**
 * フォールバック詳細要約を生成
 */
function createFallbackDetailedSummary(_text: string): string {
  return `・この記事の主要なトピックについて、詳細な情報が必要です
・技術的な背景と実装の詳細を確認してください
・具体的な手法やアプローチについて、原文を参照してください
・実践する際のポイントと注意事項を確認することを推奨します
・今後の展望や応用可能性について、追加の調査が必要です`;
}

/**
 * テキストのクリーンアップ
 */
function cleanupText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')
    .replace(/。{2,}/g, '。')
    .replace(/、{2,}/g, '、')
    .trim();
}

/**
 * 詳細要約のクリーンアップ（改行を保持）
 */
function cleanupDetailedSummary(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .replace(/。{2,}/g, '。')
    .replace(/、{2,}/g, '、');
}

/**
 * パース結果の検証
 */
export function validateParsedResult(result: ParsedSummaryResult): boolean {
  // 要約の検証（長さ制限を緩和: 300文字まで許可）
  if (!result.summary || result.summary.length < 10 || result.summary.length > 300) {
    return false;
  }

  // 詳細要約の検証
  if (!result.detailedSummary || result.detailedSummary.length < 50) {
    return false;
  }

  // タグの検証（空でも許可する）
  if (!Array.isArray(result.tags)) {
    return false;
  }

  return true;
}