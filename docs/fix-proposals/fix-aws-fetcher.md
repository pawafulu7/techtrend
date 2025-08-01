# AWSフェッチャーの修正提案

## 問題
AWSフェッチャーで空のカテゴリタグが追加されている

## 修正内容

### lib/fetchers/aws.ts の extractTags メソッドを修正

**現在のコード（132-134行目）:**
```typescript
if (item.categories && item.categories.length > 0) {
  tags.push(...item.categories);
}
```

**修正後のコード:**
```typescript
if (item.categories && item.categories.length > 0) {
  // 空文字列や空白のみのカテゴリを除外
  const validCategories = item.categories
    .filter(cat => cat && cat.trim().length > 0)
    .map(cat => cat.trim());
  tags.push(...validCategories);
}
```

## その他の推奨改善点

### 1. タグの正規化を強化
```typescript
private extractTags(item: AWSRSSItem, feedName: string): string[] {
  const tags: string[] = [];

  // カテゴリから抽出（空文字列を除外）
  if (item.categories && item.categories.length > 0) {
    const validCategories = item.categories
      .filter(cat => cat && cat.trim().length > 0)
      .map(cat => cat.trim());
    tags.push(...validCategories);
  }
  
  // 既存のコード...
  
  // 重複を削除し、タグを正規化
  const uniqueTags = [...new Set(tags)]
    .filter(tag => tag && tag.trim().length > 0)  // 再度空タグをチェック
    .map(tag => this.normalizeTag(tag));  // タグ正規化メソッドを追加
    
  return uniqueTags;
}

// タグ正規化メソッドを追加
private normalizeTag(tag: string): string {
  const normalized = tag.trim();
  
  // 既知のタグの正規化
  const tagMap: Record<string, string> = {
    "what's new": "What's New",
    "whats new": "What's New",
    // 他の正規化ルール
  };
  
  return tagMap[normalized.toLowerCase()] || normalized;
}
```

### 2. フェッチャー全体でのバリデーション強化
すべてのフェッチャーに共通のタグバリデーションロジックを追加することを推奨します。