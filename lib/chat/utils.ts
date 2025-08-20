/**
 * チャット機能のユーティリティ関数
 */

import { ChatMessage, MessageType } from './types';
import { FIXED_RESPONSES, DEFAULT_RESPONSE } from './constants';

/**
 * メッセージIDを生成
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * セッションIDを生成
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * メッセージから意図を判定
 */
export function detectMessageIntent(message: string): MessageType {
  const lowerMessage = message.toLowerCase();
  
  for (const response of FIXED_RESPONSES) {
    if (response.keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()))) {
      return response.type;
    }
  }
  
  return 'general';
}

/**
 * 固定応答を取得
 */
export function getFixedResponse(message: string) {
  const lowerMessage = message.toLowerCase();
  
  for (const response of FIXED_RESPONSES) {
    if (response.keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()))) {
      return {
        response: response.response,
        type: response.type,
        suggestedActions: response.actions
      };
    }
  }
  
  return DEFAULT_RESPONSE;
}

/**
 * 検索キーワードを抽出
 */
export function extractSearchKeywords(message: string): string[] {
  const lowerMessage = message.toLowerCase();
  const techKeywords = [
    'react', 'typescript', 'javascript', 'next.js', 'nextjs',
    'vue', 'angular', 'node.js', 'nodejs', 'python', 'ml',
    'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'github',
    'git', 'css', 'html', 'tailwind', 'prisma', 'graphql',
    'rest', 'api', 'database', 'postgresql', 'mysql', 'mongodb',
    'redis', 'testing', 'jest', 'playwright', 'cypress',
    'rails', 'ruby', 'django', 'flask', 'express', 'fastapi',
    'spring', 'laravel', 'symfony', 'svelte', 'nuxt', 'gatsby'
  ];
  
  // 単語境界を考慮した検索（部分一致を避ける）
  const foundKeywords = techKeywords.filter(keyword => {
    // 単語境界のパターンを作成
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
    return pattern.test(message);
  });
  
  // 日本語の技術キーワードも検出
  const japaneseKeywords = [
    { pattern: 'リアクト', keyword: 'react' },
    { pattern: 'タイプスクリプト', keyword: 'typescript' },
    { pattern: 'ジャバスクリプト', keyword: 'javascript' },
    { pattern: 'ネクスト', keyword: 'next.js' },
    { pattern: '機械学習', keyword: 'ml' },
    { pattern: '人工知能', keyword: 'ai' },
    { pattern: 'データベース', keyword: 'database' },
    { pattern: 'テスト', keyword: 'testing' },
    { pattern: 'レイルズ', keyword: 'rails' },
    { pattern: 'ルビー', keyword: 'ruby' },
    { pattern: 'パイソン', keyword: 'python' }
  ];
  
  japaneseKeywords.forEach(({ pattern, keyword }) => {
    if (message.includes(pattern) && !foundKeywords.includes(keyword)) {
      foundKeywords.push(keyword);
    }
  });
  
  // AI（大文字）の特別処理 - 単独の単語として検出
  if (/\bAI\b/i.test(message) && !foundKeywords.includes('ai')) {
    foundKeywords.push('ai');
  }
  
  return foundKeywords;
}

/**
 * メッセージが検索クエリかどうか判定
 */
export function isSearchQuery(message: string): boolean {
  const searchIndicators = [
    '検索', '探す', '教えて', '見つけて', 'search', 'find',
    'について', '関する', '記事', 'article'
  ];
  
  const lowerMessage = message.toLowerCase();
  const hasSearchIndicator = searchIndicators.some(indicator => 
    lowerMessage.includes(indicator)
  );
  
  const hasKeywords = extractSearchKeywords(message).length > 0;
  
  return hasSearchIndicator || hasKeywords;
}

/**
 * タイムスタンプをフォーマット
 */
export function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * メッセージを作成
 */
export function createMessage(
  content: string,
  role: 'user' | 'assistant' | 'system',
  additionalData?: Partial<ChatMessage>
): ChatMessage {
  return {
    id: generateMessageId(),
    role,
    content,
    timestamp: new Date(),
    ...additionalData
  };
}

/**
 * セッションストレージからメッセージを読み込み
 */
export function loadMessagesFromStorage(sessionId: string): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = sessionStorage.getItem(`chat-messages-${sessionId}`);
    if (!stored) return [];
    
    const messages = JSON.parse(stored);
    // タイムスタンプをDateオブジェクトに変換
    return messages.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));
  } catch (error) {
    console.error('Failed to load messages from storage:', error);
    return [];
  }
}

/**
 * セッションストレージにメッセージを保存
 */
export function saveMessagesToStorage(sessionId: string, messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    // 最新の50件のみ保存（ストレージ容量対策）
    const messagesToSave = messages.slice(-50);
    sessionStorage.setItem(
      `chat-messages-${sessionId}`,
      JSON.stringify(messagesToSave)
    );
  } catch (error) {
    console.error('Failed to save messages to storage:', error);
  }
}

/**
 * メッセージをサニタイズ（XSS対策）
 */
export function sanitizeMessage(message: string): string {
  return message
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * デバウンス関数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}