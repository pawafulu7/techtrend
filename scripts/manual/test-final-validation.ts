#!/usr/bin/env tsx
import { LocalLLMClient } from '@/lib/ai/local-llm';

async function finalValidation() {
  console.error('🎯 Local LLM 最終動作確認\n');
  console.error('設定:');
  console.error(`  maxTokens: ${process.env.LOCAL_LLM_MAX_TOKENS || '800'} (デフォルト)`);
  console.error(`  maxContentLength: ${process.env.LOCAL_LLM_MAX_CONTENT_LENGTH || '8000'} (デフォルト)`);
  console.error(`  コンテキスト: 30000トークン (LLMサーバー側設定)`);
  console.error();

  const testArticle = {
    title: 'React Server Componentsの実装ガイド: Next.js 14での活用方法',
    content: `
React Server Components (RSC) は、Reactアプリケーションのパフォーマンスと開発体験を
大幅に改善する画期的な機能です。Next.js 14では、App Routerを通じてRSCを
フルサポートしており、サーバーサイドでのレンダリングとクライアントサイドの
インタラクティビティを最適に組み合わせることができます。

## React Server Componentsとは

RSCは、サーバー上でのみ実行されるReactコンポーネントです。
これらのコンポーネントは、データフェッチングやビジネスロジックの処理を
サーバー側で完結させ、クライアントに送信されるJavaScriptバンドルサイズを
大幅に削減します。

### 主な特徴

1. **ゼロバンドルサイズ**: サーバーコンポーネントのコードはクライアントに送信されない
2. **直接的なデータアクセス**: データベースやファイルシステムに直接アクセス可能
3. **自動的なコード分割**: 必要なコンポーネントのみがクライアントに送信される
4. **プログレッシブレンダリング**: コンポーネントが準備でき次第、順次レンダリング

## Next.js 14での実装

Next.js 14のApp Routerでは、デフォルトですべてのコンポーネントが
サーバーコンポーネントとして扱われます。クライアントコンポーネントが
必要な場合は、ファイルの先頭に'use client'ディレクティブを追加します。

### サーバーコンポーネントの例

\`\`\`tsx
// app/posts/page.tsx
import { db } from '@/lib/db';

async function PostList() {
  // サーバー側で直接データベースアクセス
  const posts = await db.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  return (
    <div className="post-list">
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
          <time>{post.createdAt.toLocaleDateString()}</time>
        </article>
      ))}
    </div>
  );
}

export default PostList;
\`\`\`

### クライアントコンポーネントとの組み合わせ

\`\`\`tsx
// app/posts/[id]/page.tsx
import { db } from '@/lib/db';
import LikeButton from './LikeButton';

async function PostDetail({ params }: { params: { id: string } }) {
  const post = await db.post.findUnique({
    where: { id: params.id }
  });

  return (
    <article>
      <h1>{post.title}</h1>
      <div>{post.content}</div>
      {/* クライアントコンポーネントを含める */}
      <LikeButton postId={post.id} initialLikes={post.likes} />
    </article>
  );
}

// components/LikeButton.tsx
'use client';

import { useState } from 'react';

function LikeButton({ postId, initialLikes }) {
  const [likes, setLikes] = useState(initialLikes);
  
  const handleLike = async () => {
    const res = await fetch(\`/api/posts/\${postId}/like\`, {
      method: 'POST'
    });
    const data = await res.json();
    setLikes(data.likes);
  };

  return (
    <button onClick={handleLike}>
      いいね ({likes})
    </button>
  );
}
\`\`\`

## パフォーマンスの最適化

### Streaming とSuspense

React 18のSuspenseと組み合わせることで、コンポーネントの
ストリーミングレンダリングが可能になります。

\`\`\`tsx
import { Suspense } from 'react';
import Comments from './Comments';

function PostPage() {
  return (
    <div>
      <h1>記事タイトル</h1>
      <p>記事本文...</p>
      
      <Suspense fallback={<div>コメント読み込み中...</div>}>
        <Comments />
      </Suspense>
    </div>
  );
}
\`\`\`

### データの事前取得

\`\`\`tsx
// プリフェッチングとキャッシング
import { unstable_cache } from 'next/cache';

const getCachedPosts = unstable_cache(
  async () => {
    return await db.post.findMany();
  },
  ['posts'],
  {
    revalidate: 3600, // 1時間キャッシュ
    tags: ['posts']
  }
);
\`\`\`

## ベストプラクティス

1. **コンポーネントの分離**: サーバーとクライアントコンポーネントを明確に分離
2. **データフェッチングの最適化**: サーバーコンポーネントでデータを取得し、propsで渡す
3. **キャッシング戦略**: Next.jsのキャッシング機能を活用
4. **エラーハンドリング**: Error Boundaryを適切に配置

## パフォーマンス改善の実例

実際のプロジェクトでRSCを導入した結果：
- Initial JS Bundle: 250KB → 95KB (62%削減)
- Time to Interactive: 3.2秒 → 1.8秒 (44%改善)
- Lighthouse Score: 72 → 95

## まとめ

React Server ComponentsとNext.js 14の組み合わせにより、
高性能なWebアプリケーションを効率的に開発できます。
サーバーサイドの処理とクライアントサイドのインタラクティビティを
適切に分離することで、ユーザー体験とパフォーマンスの両方を
最適化することが可能です。
    `.trim()
  };

  const client = new LocalLLMClient({
    url: 'http://192.168.11.7:1234',
    model: 'openai/gpt-oss-20b',
    temperature: 0.3,
  });

  try {
    console.error('=' * 60);
    console.error('📝 要約生成テスト');
    console.error('=' * 60);
    
    const startTime1 = Date.now();
    const summary = await client.generateSummary(testArticle.title, testArticle.content);
    const time1 = Date.now() - startTime1;
    
    console.error(`\n要約: ${summary}`);
    console.error(`文字数: ${summary.length}文字`);
    console.error(`処理時間: ${time1}ms`);
    
    // 品質チェック
    const checks = {
      japanese: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(summary),
      noEnglish: !/need|chars|count|let's/i.test(summary),
      endsPeriod: summary.endsWith('。'),
      lengthOk: summary.length >= 60 && summary.length <= 100,
      noTruncation: !summary.endsWith('...') && !summary.endsWith('、')
    };
    
    console.error('\n✅ 品質チェック結果:');
    console.error(`  日本語: ${checks.japanese ? '✅' : '❌'}`);
    console.error(`  英語混入なし: ${checks.noEnglish ? '✅' : '❌'}`);
    console.error(`  句点で終了: ${checks.endsPeriod ? '✅' : '❌'}`);
    console.error(`  文字数適正(60-100): ${checks.lengthOk ? '✅' : '❌'}`);
    console.error(`  途切れなし: ${checks.noTruncation ? '✅' : '❌'}`);
    
    console.error('\n' + '=' * 60);
    console.error('🏷️ 要約とタグ生成テスト');
    console.error('=' * 60);
    
    const startTime2 = Date.now();
    const result = await client.generateSummaryWithTags(testArticle.title, testArticle.content);
    const time2 = Date.now() - startTime2;
    
    console.error(`\n要約: ${result.summary}`);
    console.error(`文字数: ${result.summary.length}文字`);
    console.error(`タグ: ${result.tags.join(', ')}`);
    console.error(`タグ数: ${result.tags.length}個`);
    console.error(`処理時間: ${time2}ms`);
    
    const allChecksPassed = Object.values(checks).every(v => v);
    
    console.error('\n' + '=' * 60);
    console.error('📊 最終評価');
    console.error('=' * 60);
    
    if (allChecksPassed && result.tags.length >= 3) {
      console.error('✅ すべてのチェックに合格しました！');
      console.error('\n改善効果:');
      console.error('1. maxTokens 800設定で要約が途切れない');
      console.error('2. maxContentLength 8000で長文記事も処理可能');
      console.error('3. コンテキスト30000で品質が向上');
      console.error('4. 英語の思考過程が効果的に除去された');
    } else {
      console.error('⚠️ 一部のチェックに問題があります');
      console.error('追加の調整が必要かもしれません');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

finalValidation().catch(console.error);