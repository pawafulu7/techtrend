/**
 * 要約品質改善用のクリーンアップユーティリティ
 */

interface CleanupOptions {
  removePrefix?: boolean;
  removeMarkdown?: boolean;
  removeGenericPhrases?: boolean;
  removeArticleMentions?: boolean;
  ensureProperEnding?: boolean;
  ensureTechnicalBackground?: boolean;
  targetLength?: { min: number; max: number };
}

const DEFAULT_OPTIONS: CleanupOptions = {
  removePrefix: true,
  removeMarkdown: true,
  removeGenericPhrases: true,
  removeArticleMentions: true,
  ensureProperEnding: true,
  ensureTechnicalBackground: true,
  targetLength: { min: 60, max: 120 }
};

/**
 * 一覧要約をクリーンアップ
 */
export function cleanSummary(summary: string, options: CleanupOptions = DEFAULT_OPTIONS): string {
  let cleaned = summary || '';
  
  // プレフィックスの除去
  if (options.removePrefix) {
    cleaned = cleaned
      .replace(/^\s*要約[:：]\s*/gi, '')
      .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
      .replace(/^\s*Summary[:：]\s*/gi, '')
      .replace(/^\s*##\s+要約\s*/gi, '')
      .replace(/^\s*##\s*/g, '');
  }
  
  // Markdown記法の除去
  if (options.removeMarkdown) {
    cleaned = cleaned
      .replace(/\*\*/g, '')
      .replace(/##\s*/g, '')
      .replace(/```/g, '')
      .replace(/`/g, '');
  }
  
  // 一般的な表現の除去・置換
  if (options.removeGenericPhrases) {
    cleaned = cleaned
      .replace(/を解説する記事.*$/g, 'の実装方法と活用例')
      .replace(/を紹介する記事.*$/g, 'の特徴と使用方法')
      .replace(/について説明.*$/g, 'の仕組みと実装例')
      .replace(/を解説.*$/g, '')
      .replace(/を紹介.*$/g, '')
      .replace(/について説明.*$/g, '');
  }
  
  // 「記事」への言及を除去
  if (options.removeArticleMentions) {
    cleaned = cleaned
      .replace(/する記事です。?$/g, '')
      .replace(/した記事です。?$/g, '')
      .replace(/です。$/g, '');
    
    // 「記事」で終わる場合は除去
    if (cleaned.endsWith('記事')) {
      cleaned = cleaned.slice(0, -2);
    }
  }
  
  // 文末処理
  if (options.ensureProperEnding) {
    cleaned = cleaned.replace(/。。$/g, '。').trim();
    
    // 適切な文末でない場合は句点を追加
    if (!cleaned.endsWith('。') && 
        !cleaned.endsWith('）') &&
        !cleaned.endsWith('」') &&
        !cleaned.endsWith('る') && 
        !cleaned.endsWith('た') &&
        !cleaned.endsWith('法') &&
        !cleaned.endsWith('術') &&
        !cleaned.endsWith('化') &&
        !cleaned.endsWith('例') &&
        !cleaned.endsWith('準')) {
      cleaned += '。';
    }
  }
  
  return cleaned.trim();
}

/**
 * 詳細要約をクリーンアップ
 */
export function cleanDetailedSummary(detailedSummary: string, options: CleanupOptions = DEFAULT_OPTIONS): string {
  let cleaned = detailedSummary || '';
  
  // Markdown記法の除去
  if (options.removeMarkdown) {
    cleaned = cleaned
      .replace(/\*\*/g, '')
      .replace(/##\s*/g, '')
      .replace(/```/g, '');
    
    // 各行のプレフィックスも確認
    const lines = cleaned.split('\n');
    const cleanedLines = lines.map(line => {
      if (line.trim().startsWith('・')) {
        return line.replace(/^・\s*\*\*/, '・').replace(/\*\*/g, '');
      }
      return line;
    });
    cleaned = cleanedLines.join('\n');
  }
  
  // 技術的背景の確保
  if (options.ensureTechnicalBackground) {
    const lines = cleaned.split('\n').filter(l => l.trim().startsWith('・'));
    
    if (lines.length > 0 && !lines[0].includes('記事の主題は')) {
      // 最初の項目を技術的背景に修正
      const firstLine = lines[0];
      if (firstLine.includes('具体的な問題は')) {
        lines[0] = firstLine.replace('具体的な問題は', '記事の主題は');
      } else if (firstLine.includes('解決しようとしている問題は')) {
        lines[0] = firstLine.replace('解決しようとしている問題は', '記事の主題は');
      } else if (!firstLine.includes('記事の主題')) {
        // 既存の内容を技術的背景として再構成
        const content = firstLine.replace(/^・/, '').trim();
        lines[0] = `・記事の主題は、${content}`;
      }
      
      cleaned = lines.join('\n');
    }
  }
  
  return cleaned.trim();
}

/**
 * 要約の品質をチェック
 */
export function checkSummaryQuality(summary: string): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  if (!summary || summary.trim() === '') {
    issues.push('要約なし');
    return { isValid: false, issues };
  }
  
  const s = summary.trim();
  
  // 長さチェック
  if (s.length < 20) {
    issues.push('短すぎ（<20文字）');
  } else if (s.length < 60) {
    issues.push('やや短い（<60文字）');
  }
  
  if (s.length > 150) {
    issues.push('長すぎ（>150文字）');
  } else if (s.length > 130) {
    issues.push('やや長い（>130文字）');
  }
  
  // 日本語チェック
  const japaneseChars = (s.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
  const japaneseRatio = s.length > 0 ? japaneseChars / s.length : 0;
  if (japaneseRatio < 0.3) {
    issues.push('英語混在（日本語<30%）');
  }
  
  // 一般的表現チェック
  if (s.includes('解説') || s.includes('紹介') || s.includes('説明')) {
    issues.push('一般的表現');
  }
  
  // 記事言及チェック
  if (s.includes('する記事') || s.includes('した記事') || s.includes('です。')) {
    issues.push('記事言及');
  }
  
  // プレフィックスチェック
  if (s.match(/^[\s]*要約[:：]/i) || s.match(/^\*\*要約/i)) {
    issues.push('プレフィックスあり');
  }
  
  // Markdown記法チェック
  if (s.includes('**') || s.includes('##') || s.includes('```')) {
    issues.push('Markdown記法');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * 詳細要約の品質をチェック
 */
export function checkDetailedSummaryQuality(detailedSummary: string): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  if (!detailedSummary || detailedSummary.trim() === '') {
    issues.push('詳細要約なし');
    return { isValid: false, issues };
  }
  
  const lines = detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
  
  // 項目数チェック
  if (lines.length < 6) {
    issues.push(`項目数不足（${lines.length}個）`);
  }
  
  // 技術的背景チェック
  if (lines.length > 0 && !lines[0].includes('記事の主題は')) {
    issues.push('技術的背景なし');
  }
  
  // Markdown記法チェック
  if (detailedSummary.includes('**') || detailedSummary.includes('##')) {
    issues.push('Markdown記法');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}