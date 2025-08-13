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
  
  // 200文字を超える場合は最適化処理を適用
  if (text.length > max) {
    console.warn(`要約が長すぎる: ${text.length}文字（最大${max}文字）`);
    
    // 方法1: 句点で分割して、重要度の高い文を優先的に残す
    const sentences = text.split('。').filter(s => s.trim());
    
    // 技術キーワードを含む文の重要度を評価
    const scoreSentence = (sentence: string): number => {
      let score = 0;
      
      // 技術的なキーワードを含む場合は高スコア
      const techKeywords = ['実装', '機能', '改善', '解決', '最適化', '性能', 
                           'API', 'フレームワーク', 'ライブラリ', '手法', 'アルゴリズム'];
      techKeywords.forEach(keyword => {
        if (sentence.includes(keyword)) score += 2;
      });
      
      // 数値を含む場合（具体性が高い）
      if (/\d/.test(sentence)) score += 1;
      
      // 文の位置（冒頭と末尾は重要）
      const position = sentences.indexOf(sentence);
      if (position === 0) score += 3; // 冒頭は最重要
      if (position === sentences.length - 1) score += 2; // 結論部分も重要
      
      return score;
    };
    
    // 文をスコア順にソート（位置も考慮）
    const scoredSentences = sentences.map((sentence, index) => ({
      sentence,
      score: scoreSentence(sentence),
      originalIndex: index
    }));
    
    // 重要な文を選択して再構築
    let result = '';
    const selectedSentences: typeof scoredSentences = [];
    
    // まず冒頭の文は必ず含める
    if (scoredSentences.length > 0) {
      selectedSentences.push(scoredSentences[0]);
      result = scoredSentences[0].sentence;
    }
    
    // 残りの文を重要度順に追加
    const remainingSentences = scoredSentences.slice(1).sort((a, b) => b.score - a.score);
    
    for (const item of remainingSentences) {
      const newResult = result + '。' + item.sentence;
      if (newResult.length + 1 <= max) {
        selectedSentences.push(item);
        result = newResult;
      }
    }
    
    // 元の順序に並び替えて自然な文章に
    selectedSentences.sort((a, b) => a.originalIndex - b.originalIndex);
    result = selectedSentences.map(item => item.sentence).join('。');
    
    // 句点を追加
    if (result && !result.endsWith('。')) {
      result += '。';
    }
    
    // まだ長い場合は冗長な表現を削除
    if (result.length > max) {
      result = result
        .replace(/について解説します/g, '')
        .replace(/を紹介します/g, '')
        .replace(/することができます/g, 'できる')
        .replace(/することが可能/g, '可能')
        .replace(/また、/g, '')
        .replace(/さらに、/g, '')
        .replace(/そして、/g, '')
        .replace(/つまり、/g, '')
        .replace(/なお、/g, '');
        
      // それでも長い場合は末尾を調整
      if (result.length > max) {
        const lastPeriod = result.lastIndexOf('。', max - 1);
        if (lastPeriod > min) {
          result = result.substring(0, lastPeriod + 1);
        }
      }
    }
    
    return result;
  }
  
  // 最小文字数のチェック
  if (text.length < min) {
    console.warn(`文字数が最小値未満: ${text.length}文字（最小${min}文字）`);
  }
  
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
  // プロンプトで180-200文字を指示し、200文字を超える場合は最適化
  // 重要な情報を優先的に残しながら200文字以内に調整
  const processedSummary = enforceLength(summary, 180, 200);
  
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