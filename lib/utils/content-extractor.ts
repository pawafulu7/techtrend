/**
 * RSSフィードからコンテンツを抽出するユーティリティ
 */

/**
 * RSSアイテムから本文コンテンツを抽出
 * 複数のフィールドをチェックして最適なコンテンツを取得
 */
export function extractContent(item: Record<string, unknown>): string {
  // 優先順位順にチェック
  const contentFields = [
    'content:encoded',
    'content',
    'description',
    'summary',
    'contentSnippet'
  ];
  
  for (const field of contentFields) {
    const content = item[field] as unknown;
    if (content && typeof content === 'string' && content.length > 0) {
      // HTMLタグを含む場合はそのまま返す（後続の処理でサニタイズされる）
      return content;
    }
  }
  
  // どのフィールドも空の場合
  return '';
}

/**
 * コンテンツの品質をチェック
 * @param content チェックするコンテンツ
 * @param title 記事のタイトル（ログ出力用）
 * @returns 品質チェック結果
 */
export function checkContentQuality(
  content: string, 
  title: string
): {
  isValid: boolean;
  warning?: string;
  contentLength: number;
} {
  const contentLength = content.length;
  
  if (contentLength === 0) {
    return {
      isValid: false,
      warning: `コンテンツが空です: ${title}`,
      contentLength: 0
    };
  }
  
  if (contentLength < 100) {
    return {
      isValid: true, // 警告のみ、処理は続行
      warning: `コンテンツが短すぎます（${contentLength}文字）: ${title}`,
      contentLength
    };
  }
  
  if (contentLength < 200) {
    return {
      isValid: true,
      warning: `コンテンツが少し短いです（${contentLength}文字）: ${title}`,
      contentLength
    };
  }
  
  return {
    isValid: true,
    contentLength
  };
}

/**
 * コンテンツから意味のあるテキストを抽出
 * HTMLタグやスクリプトを除去
 */
export function extractPlainText(htmlContent: string): string {
  // スクリプトタグとその内容を削除（複数パスで処理）
  let text = htmlContent;
  let previousText;
  do {
    previousText = text;
    text = text.replace(/<script\b[^<]*(?:(?!<\/script\s*>)<[^<]*)*<\/script\s*>/gi, '');
  } while (text !== previousText);

  // スタイルタグとその内容を削除（複数パスで処理）
  do {
    previousText = text;
    text = text.replace(/<style\b[^<]*(?:(?!<\/style\s*>)<[^<]*)*<\/style\s*>/gi, '');
  } while (text !== previousText);

  // HTMLタグを削除
  text = text.replace(/<[^>]+>/g, ' ');

  // HTMLエンティティをデコード（&amp;を最後に処理）
  text = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');  // 最後に処理して二重デコードを防ぐ

  // 連続する空白を1つに
  text = text.replace(/\s+/g, ' ');

  // 前後の空白を削除
  return text.trim();
}

/**
 * コンテンツを要約生成用に最適化
 * 長すぎる場合は切り詰め、短すぎる場合は警告
 */
export function optimizeContentForSummary(
  content: string,
  maxLength: number = 4000
): {
  content: string;
  isTruncated: boolean;
} {
  const plainText = extractPlainText(content);
  
  if (plainText.length <= maxLength) {
    return {
      content: plainText,
      isTruncated: false
    };
  }
  
  // 文の途中で切らないように、最後の句点または改行で切る
  let truncated = plainText.substring(0, maxLength);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('\n')
  );
  
  if (lastPeriod > maxLength * 0.8) {
    // 80%以上の位置に句点がある場合はそこで切る
    truncated = truncated.substring(0, lastPeriod + 1);
  }
  
  return {
    content: truncated,
    isTruncated: true
  };
}

/**
 * RSSアイテムからメタデータを抽出
 * 作者、カテゴリ、公開日などの追加情報を取得
 */
export function extractMetadata(item: Record<string, unknown>): {
  author?: string;
  categories?: string[];
  pubDate?: string;
  guid?: string;
} {
  const metadata: { author?: string; categories?: string[]; pubDate?: string; guid?: string } = {};
  
  // 作者情報
  if (typeof item.author === 'string') {
    metadata.author = item.author;
  } else if (typeof (item['dc:creator'] as unknown) === 'string') {
    metadata.author = item['dc:creator'] as string;
  } else if (typeof item.creator === 'string') {
    metadata.author = item.creator as string;
  }
  
  // カテゴリ情報
  if (Array.isArray(item.categories)) {
    metadata.categories = item.categories as string[];
  } else if (item.category) {
    const cat = item.category as unknown;
    metadata.categories = Array.isArray(cat) ? (cat as string[]) : [String(cat)];
  }
  
  // 公開日
  if (typeof item.pubDate === 'string') {
    metadata.pubDate = item.pubDate;
  } else if (typeof item.published === 'string') {
    metadata.pubDate = item.published as string;
  } else if (typeof item.isoDate === 'string') {
    metadata.pubDate = item.isoDate as string;
  }
  
  // GUID
  if (typeof item.guid === 'string') {
    metadata.guid = item.guid;
  } else if (typeof item.id === 'string') {
    metadata.guid = item.id as string;
  }
  
  return metadata;
}
