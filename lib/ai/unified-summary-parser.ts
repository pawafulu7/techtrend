/**
 * 統一フォーマット要約パーサー
 * summaryVersion: 5用の標準パーサー実装
 */

import { normalizeTag } from '../utils/tag-normalizer';

// プロンプト行を検出する正規表現パターン
const INSTRUCTION_PATTERNS = [
  /^-\s*記事の核心的な内容/,
  /^【条件】/,
  /^【書き方】/,
  /^【重要/,
  /^-\s*技術的価値を/,
  /^ここに.*書く/,
  /^- \d+文字以上の記事/,
];

// カテゴリ的なラベル（削除対象）
const CATEGORY_LABELS = ['技術概要', '詳細', '背景', '概要', '実装', '効果', '結果', '考察', '展望'];

// タイトル判定のしきい値
const TITLE_CHAR_THRESHOLD = 60;
const SENTENCE_MARKERS = /[。．！？]/;

export interface ParsedSummaryResult {
  summary: string;
  detailedSummary: string;
  tags: string[];
  category?: string;  // カテゴリを追加
}

/**
 * 統一フォーマットのレスポンスをパース
 */
import { TagNormalizer } from '../services/tag-normalizer';

export function parseUnifiedResponse(text: string): ParsedSummaryResult {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let category: string | undefined;
  let currentSection: 'summary' | 'detailed' | 'category' | 'tags' | null = null;
  const detailedSummaryLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // セクション検出（改善版: マークダウン形式も対応）
    if (trimmed.match(/^#+\s*[\*]*(一覧)?要約[:：]/) || trimmed.match(/^[\*]*(一覧)?要約[:：]/)) {
      currentSection = 'summary';
      const content = trimmed.replace(/^#+\s*/, '').replace(/^[\*]*(一覧)?要約[:：]/, '').trim();
      // プロンプト行をフィルタリング
      const isInstructionContent = INSTRUCTION_PATTERNS.some(pattern => pattern.test(content));
      if (content && !isInstructionContent) {
        summary = content;
        // 次の行が要約の続きの可能性をチェック
        if (i + 1 < lines.length && !lines[i + 1].trim().match(/^[\*]*詳細要約[:：]/)) {
          const nextLine = lines[i + 1].trim();
          const isInstructionNext = INSTRUCTION_PATTERNS.some(pattern => pattern.test(nextLine));
          if (nextLine && !nextLine.startsWith('・') && !nextLine.startsWith('詳細') && !isInstructionNext) {
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
    } else if (trimmed.match(/^#+\s*[\*]*カテゴリ[:：]/) || trimmed.match(/^[\*]*カテゴリ[:：]/)) {
      currentSection = 'category';
      const content = trimmed.replace(/^#+\s*/, '').replace(/^[\*]*カテゴリ[:：]/, '').trim();
      if (content) {
        category = normalizeCategory(content);
        currentSection = null;
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
        case 'summary': {
          // 要約の続き（改善: プロンプトフィルタリング追加）
          const isInstructionSummary = INSTRUCTION_PATTERNS.some(pattern => pattern.test(trimmed));
          if (!summary.includes(trimmed) && !trimmed.startsWith('・') && !isInstructionSummary) {
            summary += (summary ? ' ' : '') + trimmed;
          }
          break;
        }
        case 'detailed': {
          // 詳細要約の内容を収集（改善版：カテゴリ削除 + 1行連結 + プロンプトフィルタ）
          if (trimmed.startsWith('・') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
            // プロンプト行をフィルタリング
            const isInstructionDetailed = INSTRUCTION_PATTERNS.some(pattern => pattern.test(trimmed));
            if (!isInstructionDetailed) {
              // 「・カテゴリ：項目名」または「・項目名：内容」形式を検出
              const match = trimmed.match(/^[・\-\*]\s*(.+?)[:：]\s*(.*)$/);
              if (match) {
                const firstPart = match[1].trim();
                const secondPart = match[2].trim();
                const isCategory = CATEGORY_LABELS.includes(firstPart);
                const bulletMark = '・'; // 常に・に統一
                const colonChar = '：'; // 常に全角コロンに統一
                const nextLine = (lines[i + 1] ?? '').trim();
                const isNextInstruction = INSTRUCTION_PATTERNS.some(p => p.test(nextLine));
                const hasContinuation = nextLine && !isNextInstruction && !/^[・\-\*]/.test(nextLine);

                if (
                  isCategory &&
                  secondPart &&
                  secondPart.length <= TITLE_CHAR_THRESHOLD &&
                  !SENTENCE_MARKERS.test(secondPart) &&
                  hasContinuation
                ) {
                  // カテゴリ：タイトル 形式（次行に本文が続く）
                  // 例：「・技術概要：GPSの進化と位置情報共有の普及」
                  detailedSummaryLines.push(`${bulletMark}${secondPart}${colonChar}`);
                } else if (isCategory && secondPart) {
                  // カテゴリ：内容 形式（secondPartが長文または本文）
                  // 箇条書き記号を・に統一、コロンを全角に統一
                  detailedSummaryLines.push(`${bulletMark}${firstPart}${colonChar}${secondPart}`);
                } else {
                  // 通常の項目：内容 形式
                  // 箇条書き記号を・に統一、コロンを全角に統一
                  detailedSummaryLines.push(`${bulletMark}${firstPart}${colonChar}${secondPart}`);
                }
              } else {
                // コロンがない行はそのまま追加
                detailedSummaryLines.push(trimmed);
              }
            }
          } else if (detailedSummaryLines.length > 0 && !trimmed.match(/^[\*]*タグ[:：]/) && !trimmed.startsWith('【')) {
            // 継続行を前の行に連結（1行完結に正規化）
            const isInstructionContinuation = INSTRUCTION_PATTERNS.some(pattern => pattern.test(trimmed));
            if (!isInstructionContinuation) {
              const lastIndex = detailedSummaryLines.length - 1;
              const lastLine = detailedSummaryLines[lastIndex];

              // 前の行が「・項目名：」で終わっている場合（内容がまだない）
              if (lastLine.match(/[:：]\s*$/)) {
                detailedSummaryLines[lastIndex] += trimmed;
              } else {
                // 既に内容がある場合は句点を補完して連結
                const needsPeriod = !/[。．！？!?、，]$/.test(lastLine);
                const separator = needsPeriod ? '。' : '';
                detailedSummaryLines[lastIndex] += separator + trimmed;
              }
            }
          }
          break;
        }
        case 'category':
          if (!category) {
            category = normalizeCategory(trimmed);
            currentSection = null;
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
  
  // タグの正規化を適用
  const normalizedTags = TagNormalizer.normalizeTags(tags);
  
  // カテゴリが設定されていない場合、最初のタグから推測
  if (!category && normalizedTags.length > 0) {
    category = TagNormalizer.inferCategory(normalizedTags);
  }

  return {
    summary: cleanupText(summary),
    detailedSummary: cleanupDetailedSummary(detailedSummary),
    tags: normalizedTags.map(t => t.name).slice(0, 5), // 最大5個のタグ
    category
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
 * カテゴリ名を正規化
 */
function normalizeCategory(category: string): string | undefined {
  const categoryMap: Record<string, string> = {
    'プログラミング言語': 'language',
    'フレームワーク・ライブラリ': 'framework',
    'AI・機械学習': 'ai-ml',
    'クラウド・インフラ': 'cloud',
    'Web開発': 'web',
    'モバイル開発': 'mobile',
    'データベース': 'database',
    'セキュリティ': 'security',
    'ツール・開発環境': 'tools',
    'その他': 'other'
  };
  
  // 英語の場合も対応
  const englishCategoryMap: Record<string, string> = {
    'language': 'language',
    'framework': 'framework',
    'ai-ml': 'ai-ml',
    'cloud': 'cloud',
    'web': 'web',
    'mobile': 'mobile',
    'database': 'database',
    'security': 'security',
    'tools': 'tools',
    'other': 'other'
  };
  
  return categoryMap[category] || englishCategoryMap[category] || undefined;
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