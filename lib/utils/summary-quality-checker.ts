/**
 * 要約品質チェック機能
 * 統一プロンプトによる要約生成の品質を検証し、再生成の必要性を判定
 */

export interface QualityCheckResult {
  isValid: boolean;
  issues: QualityIssue[];
  requiresRegeneration: boolean;
  score: number;
}

export interface QualityIssue {
  type: 'length' | 'format' | 'punctuation';
  severity: 'critical' | 'major' | 'minor';
  message: string;
}

/**
 * 要約の品質をチェック
 * @param summary 一覧要約
 * @param detailedSummary 詳細要約
 * @returns 品質チェック結果
 */
export function checkSummaryQuality(
  summary: string,
  detailedSummary: string
): QualityCheckResult {
  const issues: QualityIssue[] = [];
  let score = 100;

  // 1. 一覧要約の文字数チェック
  const summaryLength = summary.length;
  if (summaryLength < 50) {
    // 50文字未満は短すぎる
    issues.push({
      type: 'length',
      severity: 'major',
      message: `一覧要約が短すぎる: ${summaryLength}文字（最小50文字）`
    });
    score -= 20;
  } else if (summaryLength < 100) {
    // 50-100文字は短めだが許容
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `一覧要約が短め: ${summaryLength}文字（理想は100-180文字）`
    });
    score -= 5;
  } else if (summaryLength > 200) {
    issues.push({
      type: 'length',
      severity: 'major',
      message: `一覧要約が長すぎる: ${summaryLength}文字（最大200文字）`
    });
    score -= 20;
  } else if (summaryLength > 180) {
    // 180文字超えは軽微な問題
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `一覧要約がやや長い: ${summaryLength}文字（理想は100-180文字）`
    });
    score -= 5;
  }

  // 2. 詳細要約の文字数チェック
  const detailedLength = detailedSummary.length;
  if (detailedLength < 500) {
    issues.push({
      type: 'length',
      severity: 'major',
      message: `詳細要約が短すぎる: ${detailedLength}文字（最小500文字）`
    });
    score -= 20;
  } else if (detailedLength > 700) {
    // 700文字超えは軽微な問題（ユーザー要望: 一ページに収まれば良い）
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `詳細要約がやや長い: ${detailedLength}文字（推奨500-700文字）`
    });
    score -= 10;
  } else if (detailedLength > 600) {
    // 600文字超えは注意レベル
    issues.push({
      type: 'length',
      severity: 'minor',
      message: `詳細要約が理想より長い: ${detailedLength}文字（理想は500-600文字）`
    });
    score -= 5;
  }

  // 3. フォーマットチェック
  const lines = detailedSummary.split('\n').filter(l => l.trim());
  const bulletPoints = lines.filter(l => l.startsWith('・'));
  
  // 箇条書きが5つあるかチェック
  if (bulletPoints.length !== 5) {
    issues.push({
      type: 'format',
      severity: 'critical',
      message: `詳細要約の箇条書きが${bulletPoints.length}個（必須5個）`
    });
    score -= 30;
  }
  
  // すべての行が箇条書きかチェック（説明文が混入していないか）
  const nonBulletLines = lines.filter(l => !l.startsWith('・'));
  if (nonBulletLines.length > 0 && bulletPoints.length === 5) {
    issues.push({
      type: 'format',
      severity: 'major',
      message: '詳細要約に箇条書き以外の行が含まれている'
    });
    score -= 15;
  }

  // 各箇条書きの文字数チェック
  bulletPoints.forEach((line, index) => {
    const lineLength = line.replace('・', '').trim().length;
    if (lineLength < 80 || lineLength > 120) {
      issues.push({
        type: 'format',
        severity: 'minor',
        message: `箇条書き${index + 1}の文字数が不適切: ${lineLength}文字（推奨100-120文字）`
      });
      score -= 3;
    }
  });

  // 4. 句点チェック
  if (!summary.endsWith('。')) {
    issues.push({
      type: 'punctuation',
      severity: 'minor',
      message: '一覧要約が句点で終わっていない'
    });
    score -= 10;
  }

  // 5. 箇条書きの句点チェック（各項目は句点で終わるべきではない）
  bulletPoints.forEach((line, index) => {
    if (line.endsWith('。')) {
      issues.push({
        type: 'punctuation',
        severity: 'minor',
        message: `箇条書き${index + 1}が句点で終わっている（箇条書きは句点不要）`
      });
      score -= 2;
    }
  });

  // スコアの下限を0に設定
  score = Math.max(0, score);

  // 再生成の必要性判定
  const requiresRegeneration = 
    issues.some(i => i.severity === 'critical') ||  // criticalな問題がある
    (issues.filter(i => i.severity === 'major').length >= 2) ||  // majorな問題が2つ以上
    score < 70;  // スコアが70点未満

  return {
    isValid: score >= 70,
    issues,
    requiresRegeneration,
    score
  };
}

/**
 * 品質チェックが有効かどうかを確認
 * @returns 品質チェックが有効な場合true
 */
export function isQualityCheckEnabled(): boolean {
  const value = process.env.QUALITY_CHECK_ENABLED;
  // デフォルトで有効（明示的にfalseまたは0でない限り）
  return value !== 'false' && value !== '0';
}

/**
 * 品質チェックの最小スコアを取得
 * @returns 最小スコア（デフォルト70）
 */
export function getMinQualityScore(): number {
  const value = process.env.QUALITY_MIN_SCORE;
  const score = parseInt(value || '70', 10);
  return isNaN(score) ? 70 : score;
}

/**
 * 最大再生成試行回数を取得
 * @returns 最大試行回数（デフォルト3）
 */
export function getMaxRegenerationAttempts(): number {
  const value = process.env.MAX_REGENERATION_ATTEMPTS;
  const attempts = parseInt(value || '3', 10);
  return isNaN(attempts) ? 3 : Math.min(attempts, 5); // 最大5回まで
}

/**
 * 品質レポートを生成
 * @param result 品質チェック結果
 * @returns フォーマットされたレポート文字列
 */
export function generateQualityReport(result: QualityCheckResult): string {
  const lines: string[] = [
    `品質スコア: ${result.score}/100`,
    `判定: ${result.isValid ? '✅ 合格' : '❌ 不合格'}`,
    `再生成必要: ${result.requiresRegeneration ? 'はい' : 'いいえ'}`,
  ];

  if (result.issues.length > 0) {
    lines.push('', '問題点:');
    const severityEmoji = {
      critical: '🔴',
      major: '🟡',
      minor: '🔵'
    };
    
    result.issues.forEach(issue => {
      lines.push(`  ${severityEmoji[issue.severity]} [${issue.severity}] ${issue.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * 品質統計を計算
 * @param results 複数の品質チェック結果
 * @returns 統計情報
 */
export function calculateQualityStats(results: QualityCheckResult[]): {
  averageScore: number;
  validCount: number;
  invalidCount: number;
  criticalIssuesCount: number;
  majorIssuesCount: number;
  minorIssuesCount: number;
  regenerationRate: number;
} {
  if (results.length === 0) {
    return {
      averageScore: 0,
      validCount: 0,
      invalidCount: 0,
      criticalIssuesCount: 0,
      majorIssuesCount: 0,
      minorIssuesCount: 0,
      regenerationRate: 0
    };
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const validCount = results.filter(r => r.isValid).length;
  const invalidCount = results.length - validCount;
  const regenerationCount = results.filter(r => r.requiresRegeneration).length;

  let criticalCount = 0;
  let majorCount = 0;
  let minorCount = 0;

  results.forEach(result => {
    result.issues.forEach(issue => {
      switch (issue.severity) {
        case 'critical':
          criticalCount++;
          break;
        case 'major':
          majorCount++;
          break;
        case 'minor':
          minorCount++;
          break;
      }
    });
  });

  return {
    averageScore: Math.round(totalScore / results.length),
    validCount,
    invalidCount,
    criticalIssuesCount: criticalCount,
    majorIssuesCount: majorCount,
    minorIssuesCount: minorCount,
    regenerationRate: Math.round((regenerationCount / results.length) * 100)
  };
}

/**
 * 一覧要約の文字数が不足している場合に拡張する
 * エラーメッセージは返さず、可能な範囲で自然な拡張を試みる
 * @param summary 元の要約
 * @param title 記事タイトル
 * @param minLength 目標文字数（デフォルト150文字だが、強制はしない）
 * @param content 記事本文（拡張用）
 * @returns 拡張された要約
 */
export function expandSummaryIfNeeded(
  summary: string,
  title: string = '',
  minLength: number = 150,
  content: string = ''  // 新規パラメータ追加
): string {
  // すでに十分な長さがある場合はそのまま返す
  if (summary.length >= minLength) {
    return summary;
  }

  // 50文字以上あれば基本的に許容するため、そのまま返す
  if (summary.length >= 50) {
    return summary;
  }

  // 句点を一時的に削除
  let expandedSummary = summary.replace(/。$/, '');
  
  // タイトルを活用した自然な拡張（タイトルが含まれていない場合）
  if (title && expandedSummary.length < 30 && !expandedSummary.includes(title.substring(0, 10))) {
    // expandedSummaryが空または非常に短い場合の処理を改善
    if (expandedSummary.length === 0 || expandedSummary.trim() === '') {
      expandedSummary = `${title}に関する内容`;
    } else {
      expandedSummary = `${title}について、${expandedSummary}`;
    }
  }
  
  // コンテンツから自然な補完を試みる（50文字を目指す）
  if (expandedSummary.length < 50 && content) {
    const cleanContent = content.replace(/[\n\r]+/g, ' ').trim();
    const shortage = 50 - expandedSummary.length;
    
    // コンテンツから適切な長さの文章を抽出
    if (cleanContent.length > shortage) {
      const additionalText = cleanContent.substring(0, shortage + 20);
      // 文の途中で切れないように調整
      const lastPeriodIndex = additionalText.lastIndexOf('。');
      if (lastPeriodIndex > 0) {
        // 既存の文章に句点がある場合のみ追加の句点を入れる
        if (expandedSummary.length > 0 && !expandedSummary.endsWith('。')) {
          expandedSummary += '。' + additionalText.substring(0, lastPeriodIndex + 1);
        } else {
          expandedSummary += additionalText.substring(0, lastPeriodIndex + 1);
        }
      } else {
        // 句点がない場合は適切な位置で切る
        const cutPoint = additionalText.lastIndexOf('、');
        if (cutPoint > 0 && cutPoint > shortage / 2) {
          if (expandedSummary.length > 0 && !expandedSummary.endsWith('。')) {
            expandedSummary += '。' + additionalText.substring(0, cutPoint);
          } else {
            expandedSummary += additionalText.substring(0, cutPoint);
          }
        } else {
          if (expandedSummary.length > 0 && !expandedSummary.endsWith('。')) {
            expandedSummary += '。' + additionalText.substring(0, shortage);
          } else {
            expandedSummary += additionalText.substring(0, shortage);
          }
        }
      }
    } else if (cleanContent.length > 0) {
      if (expandedSummary.length > 0 && !expandedSummary.endsWith('。')) {
        expandedSummary += '。' + cleanContent;
      } else {
        expandedSummary += cleanContent;
      }
    }
  }
  
  // 最後に句点で終わるように調整
  if (!expandedSummary.endsWith('。')) {
    expandedSummary += '。';
  }
  
  // 最終チェック：30文字未満は本当に短すぎるので、タイトルとコンテンツから最小限の要約を生成
  if (expandedSummary.length < 30) {
    if (title) {
      const fallbackSummary = `${title}に関する記事${content ? '。' + content.substring(0, 50).replace(/[\n\r]+/g, ' ') : ''}。`;
      return fallbackSummary;
    }
    // タイトルもない場合は、元の要約をそのまま返す
    return expandedSummary;
  }
  
  return expandedSummary;
}