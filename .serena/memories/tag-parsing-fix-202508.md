# タグ生成問題の修正 (2025年8月5日)

## 問題の概要
Gemini APIの応答形式が変更され、タグが「タグ:」の次行に出力されるようになったため、既存のパーサーではタグを取得できない問題が発生していた。

## 影響
- すべての新規記事でタグが自動生成されない
- ユーザーが手動でタグ生成スクリプトを実行して対応していた
- 18件の記事がタグなしの状態

## 修正内容

### 修正ファイル
1. `scripts/generate-summaries.ts`
2. `scripts/core/manage-summaries.ts`

### 修正方法
parseSummaryAndTags関数に`tagSectionStarted`フラグを追加し、以下の両形式に対応：

**旧形式（同一行）**:
```
タグ: JavaScript, React, フロントエンド
```

**新形式（次行）**:
```
タグ:
JavaScript, React, フロントエンド
```

### 主な変更点
```typescript
let tagSectionStarted = false; // フラグを追加

// タグ処理（修正版）
else if (line.match(/^タグ[:：]/)) {
  isDetailedSummary = false;
  tagSectionStarted = true; // フラグを立てる
  
  // 同一行にタグがある場合（後方互換性）
  const tagLine = line.replace(/^タグ[:：]\s*/, '');
  if (tagLine.trim()) {
    tags = tagLine.split(/[,、，]/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.length <= 30)
      .map(tag => normalizeTag(tag));
    tagSectionStarted = false;
  }
}
// タグが次行にある場合の処理（追加）
else if (tagSectionStarted && line.trim() && !line.match(/^(要約|詳細要約)[:：]/)) {
  tags = line.split(/[,、，]/)
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0 && tag.length <= 30)
    .map(tag => normalizeTag(tag));
  tagSectionStarted = false;
}
```

## 実装の特徴
- 後方互換性を維持（両形式をサポート）
- 既存のタグ付き記事には影響なし
- 空行でフラグをリセットして誤検出を防止

## テスト結果
- 単体テスト: 4/4成功（100%）
- 実際の記事でのテスト: 成功
- 既存機能への影響: なし

## 今後の対応
1. タグなし記事（18件）の再生成が必要
2. スケジューラーの次回実行から自動的に新形式に対応

## 関連コミット
- ee8c5a2: fix: Gemini API応答の新形式（タグが次行）に対応