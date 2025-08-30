/**
 * 記事要約の品質スコアリングシステム
 * 要約の完成度を0-100点で評価
 */

import { validateSummary, cleanupSummary } from './summary-validator';

/**
 * スコアリング基準の重み付け
 */
const SCORING_WEIGHTS = {
  completeness: 30,     // 文の完全性
  length: 25,          // 適切な長さ
  structure: 20,       // 構造（箇条書きなど）
  keywords: 15,        // キーワードの含有
  clarity: 10,         // 明確性
};

/**
 * 品質スコアの結果
 */
export interface QualityScore {
  totalScore: number;
  breakdown: {
    completeness: number;
    length: number;
    structure: number;
    keywords: number;
    clarity: number;
  };
  issues: string[];
  recommendation?: string;
}

/**
 * 要約の品質をスコアリング
 */
export function calculateSummaryScore(
  summary: string,
  options?: {
    targetLength?: number;
    isDetailed?: boolean;
    tags?: string[];
  }
): QualityScore {
  const issues: string[] = [];
  const breakdown = {
    completeness: 0,
    length: 0,
    structure: 0,
    keywords: 0,
    clarity: 0,
  };

  // デフォルトオプション
  const targetLength = options?.targetLength || 120;
  const isDetailed = options?.isDetailed || false;
  const tags = options?.tags || [];

  // 1. 文の完全性評価（30点）
  breakdown.completeness = evaluateCompleteness(summary, issues);

  // 2. 長さの適切性評価（25点）
  breakdown.length = evaluateLength(summary, targetLength, isDetailed, issues);

  // 3. 構造評価（20点）
  breakdown.structure = evaluateStructure(summary, isDetailed, issues);

  // 4. キーワード含有評価（15点）
  breakdown.keywords = evaluateKeywords(summary, tags, issues);

  // 5. 明確性評価（10点）
  breakdown.clarity = evaluateClarity(summary, issues);

  // 総合スコア計算
  const totalScore = Math.round(
    (breakdown.completeness * SCORING_WEIGHTS.completeness +
     breakdown.length * SCORING_WEIGHTS.length +
     breakdown.structure * SCORING_WEIGHTS.structure +
     breakdown.keywords * SCORING_WEIGHTS.keywords +
     breakdown.clarity * SCORING_WEIGHTS.clarity) / 100
  );

  // 推奨事項の生成
  const recommendation = generateRecommendation(totalScore, issues);

  return {
    totalScore,
    breakdown,
    issues,
    recommendation,
  };
}

/**
 * 文の完全性を評価
 */
function evaluateCompleteness(summary: string, issues: string[]): number {
  let score = 100;

  // 不完全な終了パターン
  const incompletePatterns = [
    { pattern: /。詳$/, penalty: 50, issue: '「詳」で途切れている' },
    { pattern: /CL。$/, penalty: 50, issue: '「CL。」で途切れている' },
    { pattern: /分析。$/, penalty: 30, issue: '汎用的な終了' },
    { pattern: /参照してください。$/, penalty: 20, issue: '汎用的な案内文' },
  ];

  for (const { pattern, penalty, issue } of incompletePatterns) {
    if (pattern.test(summary)) {
      score -= penalty;
      issues.push(issue);
    }
  }

  // 句点で終わっていない
  if (!summary.endsWith('。')) {
    score -= 30;
    issues.push('句点で終わっていない');
  }

  // 文が短すぎる（50文字未満）
  if (summary.length < 50) {
    score -= 40;
    issues.push('要約が短すぎる（50文字未満）');
  }

  return Math.max(0, score);
}

/**
 * 長さの適切性を評価
 */
function evaluateLength(
  summary: string,
  targetLength: number,
  isDetailed: boolean,
  issues: string[]
): number {
  const length = summary.length;
  let score = 100;

  if (isDetailed) {
    // 詳細要約の場合（200-500文字が理想）
    if (length < 200) {
      score -= 40;
      issues.push('詳細要約が短すぎる（200文字未満）');
    } else if (length > 800) {
      score -= 30;
      issues.push('詳細要約が長すぎる（800文字超）');
    } else if (length > 500) {
      score -= 10;
    }
  } else {
    // 通常要約の場合
    const deviation = Math.abs(length - targetLength);
    const deviationRate = deviation / targetLength;

    if (deviationRate > 0.5) {
      score -= 40;
      issues.push(`目標長さ（${targetLength}文字）から50%以上乖離`);
    } else if (deviationRate > 0.3) {
      score -= 20;
      issues.push(`目標長さ（${targetLength}文字）から30%以上乖離`);
    } else if (deviationRate > 0.2) {
      score -= 10;
    }
  }

  return Math.max(0, score);
}

/**
 * 構造を評価
 */
function evaluateStructure(
  summary: string,
  isDetailed: boolean,
  issues: string[]
): number {
  let score = 100;

  if (isDetailed) {
    // 詳細要約の場合、箇条書きが期待される
    const bulletPoints = summary.match(/[・•]/g);
    if (!bulletPoints) {
      score -= 50;
      issues.push('詳細要約に箇条書きがない');
    } else if (bulletPoints.length < 3) {
      score -= 20;
      issues.push('詳細要約の項目が少ない');
    }

    // 改行の存在チェック
    if (!summary.includes('\n')) {
      score -= 30;
      issues.push('詳細要約に改行がない');
    }
  } else {
    // 通常要約の場合、改行があると減点
    if (summary.includes('\n')) {
      score -= 30;
      issues.push('通常要約に改行が含まれている');
    }

    // 箇条書きがあると減点
    if (summary.includes('・') || summary.includes('•')) {
      score -= 20;
      issues.push('通常要約に箇条書きが含まれている');
    }
  }

  return Math.max(0, score);
}

/**
 * キーワード含有を評価
 */
function evaluateKeywords(
  summary: string,
  tags: string[],
  issues: string[]
): number {
  if (tags.length === 0) {
    return 100; // タグがない場合は満点
  }

  let score = 100;
  const summaryLower = summary.toLowerCase();
  const matchedTags = tags.filter(tag => 
    summaryLower.includes(tag.toLowerCase())
  );

  const matchRate = matchedTags.length / Math.min(tags.length, 3);
  if (matchRate < 0.33) {
    score -= 50;
    issues.push('関連キーワードがほとんど含まれていない');
  } else if (matchRate < 0.66) {
    score -= 20;
    issues.push('関連キーワードの含有が少ない');
  }

  return Math.max(0, score);
}

/**
 * 明確性を評価
 */
function evaluateClarity(summary: string, issues: string[]): number {
  let score = 100;

  // 不要なラベル
  const labels = ['要約:', '要約：', 'Summary:', 'まとめ:'];
  for (const label of labels) {
    if (summary.includes(label)) {
      score -= 30;
      issues.push(`不要なラベル「${label}」が含まれている`);
    }
  }

  // 汎用的すぎる文言
  const genericPhrases = [
    '記事内のコード例',
    '手順を参照してください',
    '詳細は記事を',
    '本文を参照',
  ];

  for (const phrase of genericPhrases) {
    if (summary.includes(phrase)) {
      score -= 20;
      issues.push(`汎用的な文言「${phrase}」が含まれている`);
    }
  }

  // 連続するスペースや改行
  if (/\s{3,}/.test(summary)) {
    score -= 10;
    issues.push('連続する空白文字が含まれている');
  }

  return Math.max(0, score);
}

/**
 * 推奨事項を生成
 */
function generateRecommendation(score: number, _issues: string[]): string {
  if (score >= 90) {
    return '優秀な要約です。現状を維持してください。';
  } else if (score >= 70) {
    return '良好な要約ですが、改善の余地があります。';
  } else if (score >= 50) {
    return '要約の再生成を検討してください。';
  } else {
    return '要約の品質に問題があります。即座に再生成が必要です。';
  }
}

/**
 * 複数の要約の平均スコアを計算
 */
export function calculateAverageScore(
  summaries: Array<{
    summary: string;
    tags?: string[];
    isDetailed?: boolean;
  }>
): {
  averageScore: number;
  distribution: {
    excellent: number;  // 90点以上
    good: number;       // 70-89点
    fair: number;       // 50-69点
    poor: number;       // 50点未満
  };
  totalIssues: string[];
} {
  const scores = summaries.map(item =>
    calculateSummaryScore(item.summary, {
      isDetailed: item.isDetailed,
      tags: item.tags,
    })
  );

  const averageScore = Math.round(
    scores.reduce((sum, s) => sum + s.totalScore, 0) / scores.length
  );

  const distribution = {
    excellent: scores.filter(s => s.totalScore >= 90).length,
    good: scores.filter(s => s.totalScore >= 70 && s.totalScore < 90).length,
    fair: scores.filter(s => s.totalScore >= 50 && s.totalScore < 70).length,
    poor: scores.filter(s => s.totalScore < 50).length,
  };

  const totalIssues = [...new Set(scores.flatMap(s => s.issues))];

  return {
    averageScore,
    distribution,
    totalIssues,
  };
}

/**
 * 再生成が必要かどうかを判定
 */
export function needsRegeneration(score: QualityScore): boolean {
  return score.totalScore < 50 || score.issues.some(issue =>
    issue.includes('途切れている') ||
    issue.includes('短すぎる')
  );
}