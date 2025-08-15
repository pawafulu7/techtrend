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
  let detailedSummaryLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // セクション検出（改善版: マークダウン形式も対応）
    if (trimmed.match(/^#+\s*[\*]*(一覧)?要約[:：]/) || trimmed.match(/^[\*]*(一覧)?要約[:：]/)) {
      currentSection = 'summary';
      const content = trimmed.replace(/^#+\s*/, '').replace(/^[\*]*(一覧)?要約[:：]/, '').trim();
      if (content) {
        summary = content;
        // 次の行が要約の続きの可能性をチェック
        if (i + 1 < lines.length && !lines[i + 1].trim().match(/^[\*]*詳細要約[:：]/)) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && !nextLine.startsWith('・') && !nextLine.startsWith('詳細')) {
            summary += ' ' + nextLine;
            i++; // 次の行をスキップ
          }
        }
      }
    } else if (trimmed.match(/^#+\s*[\*]*詳細要約[:：]/) || trimmed.match(/^[\*]*詳細要約[:：]/)) {
      currentSection = 'detailed';
      const content = trimmed.replace(/^#+\s*/, '').replace(/^[\*]*詳細要約[:：]/, '').trim();
      if (content && content.startsWith('・')) {
        detailedSummaryLines.push(content);
      }
    } else if (trimmed.match(/^#+\s*[\*]*タグ[:：]/) || trimmed.match(/^[\*]*タグ[:：]/)) {
      currentSection = 'tags';
      const content = trimmed.replace(/^#+\s*/, '').replace(/^[\*]*タグ[:：]/, '').trim();
      if (content) {
        tags = parseTags(content);
        currentSection = null; // タグ取得完了
      }
    } else if (trimmed) {
      // セクション内容の追加
      switch (currentSection) {
        case 'summary':
          // 要約の続き（改善: 重複チェック追加）
          if (!summary.includes(trimmed) && !trimmed.startsWith('・')) {
            summary += (summary ? ' ' : '') + trimmed;
          }
          break;
        case 'detailed':
          // 詳細要約の内容を収集（改善版）
          if (trimmed.startsWith('・') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
            detailedSummaryLines.push(trimmed);
          } else if (detailedSummaryLines.length > 0 && !trimmed.match(/^[\*]*タグ[:：]/) && !trimmed.startsWith('【')) {
            // 前の箇条書きの続きの可能性
            const lastIndex = detailedSummaryLines.length - 1;
            detailedSummaryLines[lastIndex] += trimmed;
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

  // 詳細要約を組み立て
  detailedSummary = detailedSummaryLines.join('\n');
  
  // デバッグログ
  if (detailedSummaryLines.length === 0) {
    console.log('[パーサー] 詳細要約が空 - 箇条書きが見つかりませんでした');
    console.log('[パーサー] 入力テキスト(最初の500文字):', text.substring(0, 500));
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
function createFallbackSummary(text: string, title?: string): string {
  // エラーメッセージではなく、利用可能な情報から要約を生成
  if (title) {
    const contentPreview = text.substring(0, 100).replace(/[\n\r]+/g, ' ').trim();
    return `${title}についての記事。${contentPreview}`;
  }
  
  // タイトルがない場合は、テキストの最初の部分を使用
  const cleanedText = text.replace(/[\n\r]+/g, ' ').trim();
  if (cleanedText.length > 150) {
    return cleanedText.substring(0, 150) + '...';
  }
  return cleanedText;
}

/**
 * フォールバック詳細要約を生成
 */
function createFallbackDetailedSummary(_text: string): string {
  return `・詳細要約の生成に失敗しました
・APIエラーまたはコンテンツ不足の可能性があります
・記事の内容を確認してください
・再度要約生成を試みることを推奨します
・技術サポートにお問い合わせください`;
}

/**
 * テキストのクリーンアップ
 */
function cleanupText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s　]+|[\s　]+$/g, '')
    .replace(/。{2,}/g, '。')
    .replace(/、{2,}/g, '、')
    .replace(/^(本記事は、|本記事は|本稿では、|本稿では|記事では、|記事では|この記事は、|この記事は)/g, '')
    .trim();
}

/**
 * 詳細要約のクリーンアップ（改行を保持）
 */
function cleanupDetailedSummary(text: string): string {
  // 詳細要約特有の枕詞パターン
  const detailPrefixes = [
    /^・?(提示された解決策は、|提示された解決策は)/,
    /^・?(実装の詳細としては、|実装の詳細としては)/,
    /^・?(期待される効果としては、|期待される効果としては)/,
    /^・?(問題となったコードは、|問題となったコードは)/,
    /^・?(既存の解決策としては、|既存の解決策としては|既存の解決策として、|既存の解決策として)/,
    /^・?(本記事では、|本記事では)/,
    /^・?(この記事では、|この記事では)/,
    /^・?(記事では、|記事では)/,
    /^・?(具体的な問題点は、|具体的な問題点は|具体的な問題としては、|具体的な問題としては)/,
    /^・?(実装方法としては、|実装方法としては|実装の詳細については、|実装の詳細については)/
  ];

  return text
    .split('\n')
    .map(line => {
      let cleanedLine = line.trim();
      
      // Markdown太字記法を削除（新規追加）
      cleanedLine = cleanedLine.replace(/\*\*([^*]+)\*\*/g, '$1');
      
      // 各枕詞パターンを削除
      detailPrefixes.forEach(pattern => {
        cleanedLine = cleanedLine.replace(pattern, (match) => {
          // 箇条書き記号「・」は保持
          return match.startsWith('・') ? '・' : '';
        });
      });
      
      return cleanedLine;
    })
    .filter(line => line.length > 0)
    .join('\n')
    .replace(/。{2,}/g, '。')
    .replace(/、{2,}/g, '、');
}

/**
 * パース結果の検証
 */
export function validateParsedResult(result: ParsedSummaryResult): boolean {
  // 要約の検証（長さ制限を400文字まで許可 - postProcessSummariesで調整されるため）
  if (!result.summary || result.summary.length < 10 || result.summary.length > 400) {
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