/**
 * Version 8形式の共通バリデーションユーティリティ
 */

/**
 * Version 8形式の詳細要約を検証（厳密版）
 * @param detailedSummary 検証する詳細要約
 * @returns Version 8形式に準拠している場合はtrue
 */
export function validateVersion8Format(detailedSummary: string | null | undefined): boolean {
  if (!detailedSummary) return false;
  
  // CR, CRLF, LF すべてに対応した改行正規化
  const normalizedSummary = detailedSummary.replace(/\r\n|\r|\n/g, '\n');
  const lines = normalizedSummary.split('\n').filter(line => line.trim().length > 0);
  
  // 空の場合は無効
  if (lines.length === 0) return false;
  
  // すべての行が「・項目名：内容」の形式に従うかチェック（厳密版）
  return lines.every(line => {
    const trimmed = line.trim();
    
    // 「・」で始まる必要がある
    if (!trimmed.startsWith('・')) return false;
    
    // 「：」が含まれる必要がある
    const colonIndex = trimmed.indexOf('：');
    if (colonIndex === -1) return false;
    
    // 項目名（「・」と「：」の間）が空でないことを確認
    const itemName = trimmed.substring(1, colonIndex).trim();
    if (itemName.length === 0) return false;
    
    // 内容（「：」の後）が空でないことを確認
    const content = trimmed.substring(colonIndex + 1).trim();
    if (content.length === 0) return false;
    
    return true;
  });
}

/**
 * 品質スコアの妥当性を検証
 * @param qualityScore 検証する品質スコア
 * @returns 有効な範囲（0-100）かつ有限数の場合はtrue
 */
export function validateQualityScore(qualityScore: number): boolean {
  // 有限数チェック（NaN, Infinity, -Infinityを除外）
  if (!Number.isFinite(qualityScore)) return false;
  
  // 範囲チェック
  return qualityScore >= 0 && qualityScore <= 100;
}

/**
 * articleTypeの妥当性を検証
 * @param articleType 検証する記事タイプ
 * @returns 有効な値の場合はtrue
 */
export function validateArticleType(articleType: string | null | undefined): boolean {
  if (!articleType) return false;
  
  // トリムして小文字化してから比較（大文字小文字を許容）
  const normalized = articleType.trim().toLowerCase();
  const validTypes = ['unified', 'legacy', 'simple'];
  return validTypes.includes(normalized);
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
 * 改行を正規化（CR, CRLF → LF）
 * @param text 正規化する文字列
 * @returns 正規化された文字列
 */
export function normalizeLineBreaks(text: string | null | undefined): string {
  if (!text) return '';
  // CR, CRLF, LF すべてに対応
  return text.replace(/\r\n|\r|\n/g, '\n');
}

/**
 * 詳細要約の項目数をカウントする共通関数
 * @param detailedSummary 詳細要約のテキスト
 * @param opts オプション設定
 * @param opts.strict 厳密モード（Version8形式「・項目名：内容」のみカウント）
 * @returns 項目数（・で始まる行の数）
 */
export function countDetailedItems(
  detailedSummary: string | null | undefined,
  opts: { strict?: boolean } = {}
): number {
  if (!detailedSummary) return 0;

  const { strict = false } = opts;

  // 改行を正規化
  const normalized = normalizeLineBreaks(detailedSummary);

  // 各行をチェックし、「・」で始まる行をカウント
  return normalized
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('・'))
    .filter(line => {
      if (!strict) return true;

      // 厳密モード: Version8形式（・項目名：内容）のみカウント
      const colonIndex = line.indexOf('：');
      if (colonIndex === -1) return false;

      const itemName = line.substring(1, colonIndex).trim();
      const content = line.substring(colonIndex + 1).trim();

      return itemName.length > 0 && content.length > 0;
    })
    .length;
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

/**
 * Prisma更新用のデータを準備（undefinedを除外）
 * @param data 更新データ
 * @returns undefinedを除外した更新データ
 */
export function preparePrismaUpdateData(data: {
  summary?: string | null | undefined;
  detailedSummary?: string | null | undefined;
  summaryVersion?: number | undefined;
  articleType?: string | null | undefined;
  qualityScore?: number | undefined;
}): {
  summary?: string | null;
  detailedSummary?: string | null;
  summaryVersion: number;
  articleType: string;
  qualityScore?: number;
} {
  const result: any = {};
  
  // summaryVersionとarticleTypeは固定値
  result.summaryVersion = 8;
  result.articleType = 'unified';
  
  // undefinedでない場合のみ設定
  if (data.summary !== undefined) {
    result.summary = data.summary || null;
  }
  
  if (data.detailedSummary !== undefined) {
    // 改行を正規化してから設定
    result.detailedSummary = normalizeLineBreaks(data.detailedSummary);
  }
  
  if (data.qualityScore !== undefined && Number.isFinite(data.qualityScore)) {
    // 範囲内に収める
    result.qualityScore = Math.max(0, Math.min(100, data.qualityScore));
  }
  
  return result;
}