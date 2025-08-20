'use client';

import dynamic from 'next/dynamic';

// ChatAgentを動的インポート（クライアントサイドのみ）
const ChatAgent = dynamic(
  () => import('./ChatAgent'),
  { 
    ssr: false,
    loading: () => null // ローディング中は何も表示しない
  }
);

/**
 * ChatAgentのクライアントサイドラッパー
 * Server Componentから使用可能にする
 */
export function ChatAgentWrapper() {
  return <ChatAgent />;
}

export default ChatAgentWrapper;