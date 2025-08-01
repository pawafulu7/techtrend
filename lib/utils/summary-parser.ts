export interface SummarySection {
  title: string;
  content: string;
  icon?: string;
}

export function parseSummary(detailedSummary: string): SummarySection[] {
  if (!detailedSummary) return [];

  const sections: SummarySection[] = [];
  const lines = detailedSummary.split('\n');
  
  // セクションの定義
  const sectionDefinitions = [
    {
      keyword: '記事の主題',
      title: '技術的背景',
      icon: '📋'
    },
    {
      keyword: '解決しようとしている問題',
      title: '解決する問題',
      icon: '❓'
    },
    {
      keyword: '提示されている解決策',
      title: '解決策',
      icon: '💡'
    },
    {
      keyword: '実装方法',
      title: '実装方法',
      icon: '🔧'
    },
    {
      keyword: '期待される効果',
      title: '期待される効果',
      icon: '📈'
    },
    {
      keyword: '実装時の注意点',
      title: '注意点',
      icon: '⚠️'
    }
  ];

  // 各行を処理してセクションに分類
  let currentSection: SummarySection | null = null;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // 空行はスキップ
    if (!trimmedLine) continue;
    
    // 箇条書きの開始文字を削除
    const content = trimmedLine.startsWith('・') ? trimmedLine.substring(1).trim() : trimmedLine;
    
    // セクションの判定
    let foundSection = false;
    for (const def of sectionDefinitions) {
      if (content.includes(def.keyword)) {
        // 現在のセクションを保存
        if (currentSection && currentSection.content) {
          sections.push(currentSection);
        }
        
        // 新しいセクションを開始
        currentSection = {
          title: def.title,
          content: content,
          icon: def.icon
        };
        foundSection = true;
        break;
      }
    }
    
    // セクションが見つからなかった場合、現在のセクションに追加
    if (!foundSection && currentSection) {
      currentSection.content += ' ' + content;
    }
  }
  
  // 最後のセクションを保存
  if (currentSection && currentSection.content) {
    sections.push(currentSection);
  }
  
  return sections;
}

// キーワードをハイライト表示するヘルパー関数
export function highlightKeywords(text: string): string {
  const keywords = [
    { pattern: /問題は(.+?)で/g, className: 'font-semibold' },
    { pattern: /解決策は(.+?)で/g, className: 'font-semibold text-primary' },
    { pattern: /効果は(.+?)で/g, className: 'font-semibold text-green-700' },
    { pattern: /注意点は(.+?)で/g, className: 'font-semibold text-orange-600' }
  ];
  
  let result = text;
  
  // Note: 実際のReactコンポーネントでは、dangerouslySetInnerHTMLではなく
  // 適切なReact要素として返す必要があります
  return result;
}