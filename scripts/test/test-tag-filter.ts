#!/usr/bin/env npx tsx
/**
 * タグフィルターのデバッグテスト
 */

async function testTagFilter() {
  console.log('タグフィルターのデバッグ...\n');

  try {
    // タグフィルターでReactの記事を取得
    const tagUrl = 'http://localhost:3000/api/articles?tag=React&includeEmptyContent=true';
    console.log('テストURL:', tagUrl);

    const response = await fetch(tagUrl);
    const data = await response.json();

    console.log('レスポンス:');
    console.log('- success:', data.success);
    console.log('- total:', data.data?.total);
    console.log('- page:', data.data?.page);
    console.log('- limit:', data.data?.limit);

    // 最初の3件の記事を確認
    if (data.data?.items && data.data.items.length > 0) {
      console.log('\n最初の3件の記事:');
      data.data.items.slice(0, 3).forEach((item: any, index: number) => {
        console.log(`${index + 1}. ${item.title}`);
      });
    }

    // タグなしの記事数も確認
    const noTagUrl = 'http://localhost:3000/api/articles?includeEmptyContent=true';
    const noTagResponse = await fetch(noTagUrl);
    const noTagData = await noTagResponse.json();

    console.log('\n比較:');
    console.log(`- タグフィルターなし: ${noTagData.data?.total}件`);
    console.log(`- tag=React: ${data.data?.total}件`);

    if (data.data?.total === noTagData.data?.total) {
      console.log('⚠️ 警告: タグフィルターが機能していない可能性があります');
    }

  } catch (error) {
    console.error('エラー:', error);
  }
}

testTagFilter().catch(console.error);