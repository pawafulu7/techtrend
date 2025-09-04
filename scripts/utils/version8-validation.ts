/**
 * Version 8形式の共通バリデーションユーティリティ
 */

/**
 * Version 8形式の詳細要約を検証
 * @param detailedSummary 検証する詳細要約
 * @returns Version 8形式に準拠している場合はtrue
 */
export function validateVersion8Format(detailedSummary: string | null | undefined): boolean {
  if (!detailedSummary) return false;
  
  // CRLF を LF に正規化
  const normalizedSummary = detailedSummary.replace(/\r\n/g, '\n');
  const lines = normalizedSummary.split('\n').filter(line => line.trim().length > 0);
  
  // 空の場合は無効
  if (lines.length === 0) return false;
  
  // すべての行が「・項目名：内容」の形式に従うかチェック
  return lines.every(line => {
    const trimmed = line.trim();
    return trimmed.startsWith('・') && trimmed.includes('：');
  });
}

/**
 * 品質スコアの妥当性を検証
 * @param qualityScore 検証する品質スコア
 * @returns 有効な範囲（0-100）の場合はtrue
 */
export function validateQualityScore(qualityScore: number): boolean {
  return qualityScore >= 0 && qualityScore <= 100;
}

/**
 * articleTypeの妥当性を検証
 * @param articleType 検証する記事タイプ
 * @returns 有効な値の場合はtrue
 */
export function validateArticleType(articleType: string | null | undefined): boolean {
  const validTypes = ['unified', 'legacy', 'simple'];
  return articleType ? validTypes.includes(articleType) : false;
}

/**
 * Unicode安全な文字列切り出し
 * @param text 切り出す文字列
 * @param maxLength 最大文字数
 * @param addEllipsis 省略記号を追加するか
 * @returns 切り出された文字列
 */
export function safeSubstring(
  text: string | null | undefined, 
  maxLength: number, 
  addEllipsis: boolean = true
): string {
  if (!text) return '';
  
  const chars = Array.from(text);
  if (chars.length <= maxLength) {
    return text;
  }
  
  const truncated = chars.slice(0, maxLength).join('');
  return addEllipsis ? truncated + '...' : truncated;
}

/**
 * 改行を正規化（CRLF → LF）
 * @param text 正規化する文字列
 * @returns 正規化された文字列
 */
export function normalizeLineBreaks(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\r\n/g, '\n');
}

/**
 * Version 8形式の生成結果を総合的に検証
 * @param result 検証する結果オブジェクト
 * @returns 検証結果とエラーメッセージ
 */
export function validateGenerationResult(result: {
  summary?: string | null;
  detailedSummary?: string | null;
  summaryVersion?: number;
  articleType?: string | null;
  qualityScore?: number;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // 必須フィールドのチェック
  if (!result.summary || result.summary.trim().length === 0) {
    errors.push('一覧要約が空です');
  }
  
  if (!result.detailedSummary || result.detailedSummary.trim().length === 0) {
    errors.push('詳細要約が空です');
  }
  
  // Version 8チェック
  if (result.summaryVersion !== 8) {
    errors.push(`summaryVersionが8ではありません: ${result.summaryVersion}`);
  }
  
  // articleTypeチェック
  if (!validateArticleType(result.articleType)) {
    errors.push(`無効なarticleType: ${result.articleType}`);
  }
  
  // 品質スコアチェック
  if (result.qualityScore !== undefined && !validateQualityScore(result.qualityScore)) {
    errors.push(`品質スコアが範囲外です: ${result.qualityScore}`);
  }
  
  // Version 8形式チェック
  if (result.detailedSummary && !validateVersion8Format(result.detailedSummary)) {
    errors.push('詳細要約がVersion 8形式に準拠していません');
  }
  
  // 一覧要約の長さチェック（最大400文字）
  if (result.summary && result.summary.length > 400) {
    errors.push(`一覧要約が長すぎます: ${result.summary.length}文字`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}