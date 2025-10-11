import { ArticleType, getArticleTypeSections } from './article-type-prompts';
import { INSTRUCTION_PATTERNS } from '@/lib/ai/constants';

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

// summaryVersion 7用のアイコン取得関数
function getIconForFlexibleTitle(title: string): string {
  // タイトルに含まれるキーワードに基づいてアイコンを選択
  const iconMap: { [key: string]: string } = {
    // 性能・パフォーマンス関連
    '性能': '⚡',
    'パフォーマンス': '⚡',
    '速度': '🚀',
    'ベンチマーク': '📊',
    
    // 評価・比較関連
    '評価': '📝',
    '比較': '⚖️',
    'メリット': '✅',
    'デメリット': '⚠️',
    '利点': '✅',
    '欠点': '⚠️',
    '課題': '🎯',
    '問題': '❓',
    
    // 価格・コスト関連
    '価格': '💰',
    'コスト': '💰',
    '料金': '💳',
    '費用': '💸',
    
    // 機能・技術関連
    '機能': '🔧',
    '新機能': '✨',
    '実装': '🛠️',
    'ツール': '🔨',
    '技術': '💻',
    '仕様': '📋',
    'API': '🔌',
    
    // 使用・適用関連
    '使用': '👥',
    '用途': '🎯',
    '適用': '📍',
    'ユースケース': '📚',
    
    // モデル・設定関連
    'モデル': '🤖',
    '設定': '⚙️',
    'パラメータ': '🎛️',
    'オプション': '🔧',
    
    // 発表・リリース関連
    '発表': '📢',
    'リリース': '🚀',
    'アップデート': '🔄',
    '更新': '🔄',
    
    // 影響・効果関連
    '影響': '💫',
    '効果': '📈',
    '改善': '📈',
    '展望': '🔮',
    '将来': '🔮',
    
    // セキュリティ関連
    'セキュリティ': '🔒',
    '認証': '🔐',
    '暗号': '🔑',
    
    // その他
    '概要': '📄',
    '背景': '📋',
    '結論': '🎯',
    '注意': '⚠️',
    '補足': '📝'
  };
  
  // タイトルにマッチするキーワードを検索
  for (const [keyword, icon] of Object.entries(iconMap)) {
    if (title.includes(keyword)) {
      return icon;
    }
  }
  
  // デフォルトアイコン
  return '📌';
}

export function parseSummary(detailedSummary: string, options?: ParseOptions): SummarySection[] {
  if (!detailedSummary) return [];

  let sections: SummarySection[] = [];
  const lines = detailedSummary.split('\n');
  
  // summaryVersion 7または8の処理（AIが自由に項目を設定）
  if (options?.summaryVersion === 7 || options?.summaryVersion === 8) {
    let currentMainSection: SummarySection | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // プロンプト行をスキップ
      const isInstruction = INSTRUCTION_PATTERNS.some(pattern => pattern.test(trimmedLine));
      if (isInstruction) continue;

      // メイン項目（・）とサブ項目（-）を区別
      const isMainItem = trimmedLine.startsWith('・');
      const isSubItem = trimmedLine.startsWith('-');
      
      if (isMainItem || isSubItem) {
        // 正規表現で項目名と内容を分離（コロン後が空でも許可）
        const match = trimmedLine.match(/^[・-]\s*(.+?)[:：]\s*(.*)$/);
        
        if (match) {
          const title = match[1].trim();
          const content = match[2].trim();
          
          if (isMainItem && !content) {
            // コロン後が空のメイン項目
            // 前のメイン項目があれば先に追加
            if (currentMainSection) {
              sections.push(currentMainSection);
            }
            // 新しいメイン項目を準備（サブ項目を待つ）
            currentMainSection = {
              title: title,
              content: '',
              icon: getIconForFlexibleTitle(title)
            };
          } else if (isMainItem && content) {
            // 通常のメイン項目（コロン後に内容がある）
            // 前のメイン項目があれば先に追加
            if (currentMainSection) {
              sections.push(currentMainSection);
            }
            sections.push({
              title: title,
              content: content,
              icon: getIconForFlexibleTitle(title)
            });
            currentMainSection = null;
          } else if (isSubItem) {
            // サブ項目（コロンがある場合）
            if (currentMainSection) {
              // 前のメイン項目のサブ項目として追加
              if (currentMainSection.content) {
                currentMainSection.content += '\n';
              }
              currentMainSection.content += `- ${title}：${content}`;
            } else {
              // 独立したサブ項目として追加
              sections.push({
                title: title,
                content: content,
                icon: getIconForFlexibleTitle(title)
              });
            }
          }
        } else {
          // コロンがない場合の処理
          if (isSubItem && currentMainSection) {
            // サブ項目（コロンなし）を前のメイン項目に追加
            const content = trimmedLine.replace(/^-\s*/, '').trim();
            if (content) {
              if (currentMainSection.content) {
                currentMainSection.content += '\n';
              }
              currentMainSection.content += `• ${content}`;
            }
          } else if (isMainItem) {
            // メイン項目（コロンなし）
            const content = trimmedLine.replace(/^・\s*/, '').trim();
            // 前のメイン項目があれば先に追加
            if (currentMainSection) {
              sections.push(currentMainSection);
              currentMainSection = null;
            }
            sections.push({
              title: '詳細',
              content: content,
              icon: '📝'
            });
          }
        }
      }
    }

    // 最後のメイン項目を追加
    if (currentMainSection && currentMainSection.content) {
      sections.push(currentMainSection);
    }

    // 空のcontentを持つセクションを除外
    sections = sections.filter(section => section.content && section.content.trim() !== '');

    return sections;
  }
  
  // セクションの定義を取得（記事タイプがある場合は動的に、ない場合は旧形式）
  let sectionDefinitions;
  
  if ((options?.articleType as unknown as string) === 'unified' || options?.summaryVersion === 5) {
    // summaryVersion 5も動的項目名として処理する
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // 「・項目名：内容」形式をパース
      if (trimmedLine.startsWith('・') || trimmedLine.startsWith('-')) {
        // 正規表現で項目名と内容を分離
        const match = trimmedLine.match(/^[・-]\s*(.+?)[:：]\s*(.+)$/);
        if (match) {
          const title = match[1].trim();
          const content = match[2].trim();
          
          sections.push({
            title: title,
            content: content,
            icon: getIconForFlexibleTitle(title)
          });
        } else {
          // コロンがない場合は全体を内容として扱う
          let content = trimmedLine.replace(/^[・-]\s*/, '').trim();
          
          // 古い形式のプレフィックスを削除
          const oldPrefixes = [
            '記事の主題は、',
            '具体的な問題は、',
            '提示されている解決策は、',
            '実装方法の詳細については、',
            '期待される効果は、',
            'この記事の主要なトピックは、',
            '技術的な背景として、'
          ];
          
          for (const prefix of oldPrefixes) {
            if (content.startsWith(prefix)) {
              content = content.substring(prefix.length).trim();
              break;
            }
          }
          
          // タイトルを内容から推測
          let title = '詳細';
          if (content.includes('問題') || content.includes('課題')) {
            title = '課題・問題点';
          } else if (content.includes('解決') || content.includes('方法')) {
            title = '解決策';
          } else if (content.includes('効果') || content.includes('メリット')) {
            title = '期待効果';
          } else if (content.includes('実装') || content.includes('技術')) {
            title = '技術詳細';
          }
          
          sections.push({
            title: title,
            content: content,
            icon: getIconForFlexibleTitle(title)
          });
        }
      }
    }
    
    return sections; // 早期リターン
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
