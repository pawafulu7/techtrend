/**
 * 要約の後処理を行い、文字数制約と形式を強制的に適用
 */

/**
 * 文字数を指定範囲内に強制調整
 * @param text 調整対象テキスト
 * @param min 最小文字数
 * @param max 最大文字数
 * @returns 調整後のテキスト
 */
export function enforceLength(text: string, min: number, max: number): string {
  if (!text) return text;
  
  // 極端に長い場合のみ安全装置として処理（300文字以上）
  // プロンプトで200文字前後を指示しているため、通常は不要
  const safetyThreshold = 300;
  
  if (text.length > safetyThreshold) {
    console.warn(`要約が極端に長い: ${text.length}文字（安全閾値${safetyThreshold}文字）`);
    
    // 句点で分割して文単位で削除
    const sentences = text.split('。').filter(s => s.trim());
    let result = '';
    
    for (const sentence of sentences) {
      const newResult = result ? `${result}。${sentence}` : sentence;
      // maxではなくsafetyThresholdを使用
      if (newResult.length + 1 <= max) {
        result = newResult;
      } else {
        break;
      }
    }
    
    // 句点を追加
    if (result && !result.endsWith('。')) {
      result += '。';
    }
    
    return result;
  }
  
  // 最小文字数のチェックは警告のみ（内容の追加はしない）
  if (text.length < min) {
    console.warn(`文字数が最小値未満: ${text.length}文字（最小${min}文字）`);
  }
  
  // 通常はそのまま返す（プロンプトの指示を信頼）
  return text;
}

/**
 * 箇条書きの句点を除去
 * @param text 処理対象の詳細要約
 * @returns 句点を除去した詳細要約
 */
export function removeBulletPointPeriods(text: string): string {
  if (!text) return text;
  
  return text.split('\n').map(line => {
    const trimmedLine = line.trim();
    // 箇条書き行で句点で終わっている場合は除去
    if (trimmedLine.startsWith('・') && trimmedLine.endsWith('。')) {
      return trimmedLine.slice(0, -1);
    }
    return line;
  }).join('\n');
}

/**
 * 詳細要約の各項目の文字数を調整
 * @param detailedSummary 詳細要約
 * @param itemMin 各項目の最小文字数
 * @param itemMax 各項目の最大文字数
 * @returns 調整後の詳細要約
 */
export function adjustDetailedSummaryItems(
  detailedSummary: string,
  itemMin: number = 100,
  itemMax: number = 120
): string {
  if (!detailedSummary) return detailedSummary;
  
  const lines = detailedSummary.split('\n');
  const adjustedLines = lines.map(line => {
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('・')) {
      // 「・」とコロンまでの部分を保持
      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex === -1) {
        // コロンがない場合は全体を調整
        const content = trimmedLine.substring(1).trim();
        const adjusted = enforceLength(content, itemMin, itemMax);
        return `・${adjusted}`;
      }
      
      const prefix = trimmedLine.substring(0, colonIndex + 1);
      const content = trimmedLine.substring(colonIndex + 1).trim();
      
      // 内容部分の文字数を調整
      if (content.length > itemMax) {
        // 文を短縮
        const shortened = content.substring(0, itemMax);
        // 最後の句読点までで切る
        const lastPunctuation = Math.max(
          shortened.lastIndexOf('、'),
          shortened.lastIndexOf('。')
        );
        if (lastPunctuation > itemMax * 0.8) {
          return `${prefix} ${shortened.substring(0, lastPunctuation)}`;
        }
        return `${prefix} ${shortened}`;
      }
      
      return line;
    }
    
    return line;
  });
  
  return adjustedLines.join('\n');
}

/**
 * 要約全体の後処理
 * @param summary 一覧要約
 * @param detailedSummary 詳細要約
 * @returns 処理後の要約
 */
export function postProcessSummaries(
  summary: string,
  detailedSummary: string
): { summary: string; detailedSummary: string } {
  // 一覧要約の処理
  // プロンプトで200文字前後を指示しているため、基本的には生成結果を信頼
  // 300文字以上の極端に長い場合のみ安全装置として制限（220文字まで）
  const processedSummary = enforceLength(summary, 180, 220);
  
  // 詳細要約の処理
  let processedDetailedSummary = detailedSummary;
  
  // 1. 句点を除去
  processedDetailedSummary = removeBulletPointPeriods(processedDetailedSummary);
  
  // 2. 各項目の文字数を調整
  processedDetailedSummary = adjustDetailedSummaryItems(processedDetailedSummary);
  
  // 3. 詳細要約の文字数チェック（1000文字以上の場合のみ警告＆制限）
  if (processedDetailedSummary.length > 1000) {
    console.warn(`詳細要約が極端に長い: ${processedDetailedSummary.length}文字（推奨600-800文字）`);
    // 1000文字を超える場合は600文字にカット
    processedDetailedSummary = enforceLength(processedDetailedSummary, 500, 600);
  } else if (processedDetailedSummary.length < 500) {
    // 500文字未満の場合は警告のみ
    console.warn(`詳細要約が短い: ${processedDetailedSummary.length}文字（推奨600-800文字）`);
  }
  // 500-1000文字の範囲はそのまま許容（800文字程度が理想的）
  
  return {
    summary: processedSummary,
    detailedSummary: processedDetailedSummary
  };
}