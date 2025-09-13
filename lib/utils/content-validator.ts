/**
 * コンテンツ検証ユーティリティ
 * 記事コンテンツの妥当性を検証する機能を提供
 */

import { isUrlFromDomain } from './url-validator';

/**
 * コンテンツが削除メッセージかどうかを判定
 * @param content - 検証するコンテンツ
 * @returns 削除メッセージの場合はtrue
 */
export function isDeletedContent(content: string | null | undefined): boolean {
  if (!content) return false;
  
  // 削除メッセージのパターン
  const deletedPatterns = [
    // 英語パターン
    'Deleted articles cannot be recovered',
    'This article has been deleted',
    'This post has been deleted',
    'Article not found',
    'Post not found',
    'This content is no longer available',
    'Are you sure you want to delete this article',
    
    // 日本語パターン
    '記事は削除されました',
    'この記事は削除されています',
    '削除された記事',
    '記事が見つかりません',
    'ページが見つかりません',
    'コンテンツは利用できません',
  ];
  
  // いずれかのパターンが含まれているかチェック
  const lowerContent = content.toLowerCase();
  return deletedPatterns.some(pattern => 
    lowerContent.includes(pattern.toLowerCase())
  );
}

/**
 * コンテンツの品質を検証
 * @param content - 検証するコンテンツ
 * @returns 検証結果
 */
export function validateContentQuality(content: string | null | undefined): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // 空のコンテンツ
  if (!content || content.trim().length === 0) {
    issues.push('コンテンツが空です');
    return { isValid: false, issues };
  }
  
  // 削除メッセージ
  if (isDeletedContent(content)) {
    issues.push('削除メッセージが検出されました');
  }
  
  // 短すぎるコンテンツ（50文字未満）
  if (content.trim().length < 50) {
    issues.push(`コンテンツが短すぎます（${content.trim().length}文字）`);
  }
  
  // HTMLエラーメッセージのパターン
  const errorPatterns = [
    '404 not found',
    '403 forbidden',
    '500 internal server error',
    'access denied',
    'permission denied',
  ];
  
  const lowerContent = content.toLowerCase();
  errorPatterns.forEach(pattern => {
    if (lowerContent.includes(pattern)) {
      issues.push(`エラーメッセージが検出されました: ${pattern}`);
    }
  });
  
  // プレースホルダーテキストの検出
  const placeholderPatterns = [
    'lorem ipsum',
    'coming soon',
    'under construction',
    '準備中',
    '工事中',
  ];
  
  placeholderPatterns.forEach(pattern => {
    if (lowerContent.includes(pattern.toLowerCase())) {
      issues.push(`プレースホルダーテキストが検出されました: ${pattern}`);
    }
  });
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Qiita記事のURLかどうかを判定
 * @param url - 検証するURL
 * @returns Qiita記事の場合はtrue
 */
export function isQiitaUrl(url: string): boolean {
  return isUrlFromDomain(url, 'qiita.com') && url.includes('/items/');
}

/**
 * URLから記事タイプを判定
 * @param url - 判定するURL
 * @returns 記事タイプ
 */
export function detectArticleType(url: string): string {
  if (isQiitaUrl(url)) return 'qiita';
  if (isUrlFromDomain(url, 'zenn.dev')) return 'zenn';
  if (isUrlFromDomain(url, 'dev.to')) return 'devto';
  if (isUrlFromDomain(url, 'speakerdeck.com')) return 'speakerdeck';
  if (isUrlFromDomain(url, 'slideshare.net')) return 'slideshare';
  if (isUrlFromDomain(url, 'github.com')) return 'github';
  if (isUrlFromDomain(url, 'medium.com')) return 'medium';
  if (isUrlFromDomain(url, 'note.com')) return 'note';
  return 'other';
}

/**
 * コンテンツのサニタイズ
 * 不要な文字や空白を削除
 * @param content - サニタイズするコンテンツ
 * @returns サニタイズされたコンテンツ
 */
export function sanitizeContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n') // 改行コードの統一
    .replace(/\n{3,}/g, '\n\n') // 過度な改行の削除
    .replace(/^\s+|\s+$/g, '') // 前後の空白削除
    .replace(/\t/g, '  '); // タブをスペースに変換
}