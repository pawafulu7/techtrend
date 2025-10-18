# スキップされているテストの分析レポート

**作成日**: 2025年9月23日
**総スキップ数**: 約70件（.skip, describe.skip含む）

## 📊 概要サマリー

| カテゴリ | 件数 | 修正可能性 | 推奨アクション |
|---------|------|-----------|---------------|
| APIモック関連 | 15件 | ✅ 修正可能 | モック設定を現在の実装に合わせる |
| Redis/認証 | 10件 | ✅ 修正可能 | Redisモック設定の修正 |
| 推薦機能 | 8件 | ❌ 修正不可 | 機能無効化のため削除推奨 |
| 削除済みUI | 12件 | ❌ 修正不可 | UI変更により削除推奨 |
| CI環境依存 | 15件 | ⚠️ 条件付き | 現状維持（CI判定ロジック維持） |
| その他 | 10件 | 🔍 要調査 | 個別に判断必要 |

## 🔴 削除推奨テスト（優先度: 高）

### 1. 推薦機能関連（機能が無効化）

#### **lib/recommendation/__tests__/recommendation-service.test.ts**
```typescript
describe.skip('RecommendationService', () => {
  // 28行目: describe全体がスキップ
```
**削除理由**: 推薦機能自体が現在無効化されており、実装が不完全

#### **__tests__/api/recommendations/route.test.ts**
- 95行目: 認証済みユーザーの推薦記事を返す（キャッシュなし）
- 114行目: キャッシュから推薦記事を返す
- 128行目: カスタムlimitパラメータを処理する
- 181行目: 推薦サービスエラーの場合500を返す
- 193行目: Redisエラーでも処理を続行する
- 207行目: 空の推薦リストを正しく処理する

**削除理由**: APIエンドポイントは存在するが、推薦ロジックが無効化されている

### 2. 削除済みUI要素

#### **__tests__/e2e/filter-persistence.spec.ts**
```typescript
// 以下のテストは対応するUI要素が削除されている
- 102行目: カテゴリが存在しないためスキップ
- 118行目: ソースフィルターが存在しないためスキップ
- 229行目: カテゴリが存在しないためスキップ
- 241行目: チェックボックスが存在しないためスキップ
- 300行目: 日付範囲フィルターが存在しないためスキップ
- 331行目: 日付範囲オプションが見つからないためスキップ
```
**削除理由**: UIリニューアルでこれらのフィルター要素が削除された

#### **__tests__/e2e/specs/search.spec.ts**
```typescript
- 425行目: test.skip('高度な検索オプション（機能削除済み）', ...)
- 429行目: test.skip('検索履歴・候補の表示（SearchBar削除により無効）', ...)
```
**削除理由**: SearchBarコンポーネントと高度な検索機能が削除された

## ✅ 修正可能なテスト（優先度: 中）

### 1. APIモック関連

#### **lib/ai/__tests__/unified-summary-service.test.ts**
```typescript
// 123行目: should retry on API failure
// 149行目: should throw error after max retries
// 159行目: should handle low quality score
// 234行目: should handle empty candidates in API response
```

**修正方法**:
```typescript
// fetchモックを現在のGemini APIレスポンス構造に合わせる
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    candidates: [{
      content: {
        parts: [{ text: JSON.stringify({
          summary: "要約",
          detailedSummary: "詳細要約",
          qualityScore: 80,
          tags: []
        }) }]
      }
    }]
  })
});
```

### 2. Redis/認証関連

#### **lib/auth/__tests__/redis-adapter.test.ts**
```typescript
// 191行目: should create a new session
// 219行目: should retrieve session and user data
// 280行目: should delete a session
```

**修正方法**:
```typescript
// Redis Mockの正しい設定
jest.mock('@/lib/cache/redis-client', () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    ping: jest.fn(() => Promise.resolve('PONG')),
    quit: jest.fn()
  }))
}));
```

#### **__tests__/api/cache/health/route.test.ts**
```typescript
// 72行目: Redis接続エラーの場合degraded状態を返す
// 87行目: サーキットブレーカーがOPENの場合degraded状態を返す
// 127行目: Redisレスポンスタイムが遅い場合推奨事項を含む
// その他4件
```

**修正方法**:
```typescript
// サーキットブレーカーのモック設定を追加
jest.mock('@/lib/cache/circuit-breaker', () => ({
  CircuitBreaker: jest.fn().mockImplementation(() => ({
    getState: jest.fn(() => 'CLOSED'),
    execute: jest.fn((fn) => fn()),
    reset: jest.fn()
  }))
}));
```

## ⚠️ 条件付き維持（優先度: 低）

### CI環境依存テスト

これらのテストはCI環境でのみスキップされ、ローカルでは実行される設計になっています。
**現状のまま維持を推奨**します。

#### **__tests__/e2e/visual-regression.spec.ts**
```typescript
test.describe.skip(isRunningInCI(), 'Visual Regression Tests', () => {
  // CI環境では画像比較が不安定
```

#### **__tests__/e2e/tag-search.spec.ts**
```typescript
test.skip(Boolean(isCI), 'CI環境では企業タグデータが不足');
test.skip(Boolean(isCI), 'CI環境では検索が高速すぎてスピナーが表示されない');
```

#### **__tests__/e2e/password-change-improved.spec.ts**
```typescript
test.skip(!!isCI, 'CI環境では認証が不安定なためスキップ');
// 複数の認証関連テスト
```

## 🔍 要調査テスト

### 1. コンポーネントテスト

#### **app/components/article/__tests__/ArticleList.test.tsx**
```typescript
// 259行目: 既読状態変更イベントで再レンダリングとUI更新を確認する
// 357行目: refreshKeyで強制再レンダリングする
```
**調査必要**: カスタムイベントの実装状況を確認

#### **lib/auth/__tests__/utils.test.ts**
```typescript
describe.skip('createUser', () => {
  // 79行目: createUser関数のテスト全体
```
**調査必要**: createUser関数の現在の実装状況を確認

### 2. E2Eテスト

#### **e2e/infinite-scroll.spec.ts**
```typescript
// 148行目: ページ最下部に到達すると「すべての記事を読み込みました」が表示される
```
**調査必要**: 無限スクロールの終了処理の実装状況

## 📋 推奨アクションプラン

### Phase 1: クリーンアップ（1日）
1. 推薦機能関連のテストを削除
2. 削除済みUI要素のテストを削除
3. 未使用のテストファイルの削除

### Phase 2: モック修正（2-3日）
1. unified-summary-service.test.ts のAPIモック修正
2. redis-adapter.test.ts のRedisモック修正
3. cache/health/route.test.ts のヘルスチェック修正
4. その他のモック関連修正

### Phase 3: 要調査テストの判断（1-2日）
1. 各テストの現在の実装状況を確認
2. 修正可能なものは修正
3. 不要なものは削除

## 🎯 期待される成果

- **コードカバレッジの正確な把握**: スキップテストを整理することで真の カバレッジが明確に
- **メンテナンス性の向上**: 不要なテストコードの削除でコードベースがクリーンに
- **CI/CD の安定性向上**: 不安定なテストの適切な処理
- **開発者体験の向上**: テスト実行時の混乱を解消

## 📝 注意事項

1. **削除前に必ずgit branchを作成**
2. **削除理由をコミットメッセージに明記**
3. **チーム内で削除対象の合意を取る**
4. **修正後は必ず全テストを実行して回帰がないことを確認**

## 🔄 更新履歴

- 2025年9月23日: 初回分析完了