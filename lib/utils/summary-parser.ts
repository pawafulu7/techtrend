import { ArticleType, getArticleTypeSections, getUnifiedSections } from './article-type-prompts';

export interface SummarySection {
  title: string;
  content: string;
  icon?: string;
}

// 記事タイプとバージョン情報を含む拡張インターフェース
export interface ParseOptions {
  articleType?: ArticleType;
  summaryVersion?: number;
}

export function parseSummary(detailedSummary: string, options?: ParseOptions): SummarySection[] {
  if (!detailedSummary) return [];

  const sections: SummarySection[] = [];
  const lines = detailedSummary.split('\n');
  
  // セクションの定義を取得（記事タイプがある場合は動的に、ない場合は旧形式）
  let sectionDefinitions;
  
  if (options?.articleType === 'unified' || options?.summaryVersion === 5) {
    // 統一フォーマット - 単純な箇条書き形式を処理
    // 各箇条書き項目をそのままセクションとして扱う
    const unifiedSections = getUnifiedSections();
    let sectionIndex = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      if (trimmedLine.startsWith('・')) {
        let content = trimmedLine.substring(1).trim();
        
        if (sectionIndex < unifiedSections.length) {
          // プレフィックスを削除
          const prefixToRemove = unifiedSections[sectionIndex].title;
          // 「、」または「は、」で終わるプレフィックスを削除
          if (content.startsWith(prefixToRemove)) {
            // プレフィックスとその後の「、」を削除
            content = content.substring(prefixToRemove.length).replace(/^[、は]*/, '').trim();
          }
          
          sections.push({
            title: unifiedSections[sectionIndex].title,
            content: content,
            icon: unifiedSections[sectionIndex].icon
          });
          sectionIndex++;
        } else {
          // 5つ以上の項目がある場合は追加情報として扱う
          sections.push({
            title: '補足情報',
            content: content,
            icon: '📝'
          });
        }
      }
    }
    
    return sections; // 統一フォーマットは早期リターン
  } else if (options?.articleType && options?.summaryVersion === 2) {
    // 新形式：記事タイプ別のセクション定義を使用
    const typeSections = getArticleTypeSections(options.articleType);
    sectionDefinitions = typeSections.map(section => ({
      keyword: section.title.replace(/[・、]/g, ''), // タイトルをキーワードとして使用
      title: section.title,
      icon: section.icon
    }));
  } else {
    // 旧形式：固定の問題解決型セクション定義
    sectionDefinitions = [
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
  }

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
  // const keywords = [
  //   { pattern: /問題は(.+?)で/g, className: 'font-semibold' },
  //   { pattern: /解決策は(.+?)で/g, className: 'font-semibold text-primary' },
  //   { pattern: /効果は(.+?)で/g, className: 'font-semibold text-green-700' },
  //   { pattern: /注意点は(.+?)で/g, className: 'font-semibold text-orange-600' }
  // ];
  
  const result = text;
  
  // Note: 実際のReactコンポーネントでは、dangerouslySetInnerHTMLではなく
  // 適切なReact要素として返す必要があります
  return result;
}