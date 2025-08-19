# フィルター永続化機能実装ドキュメント

## 概要
TechTrendにフィルター条件の永続化機能を実装しました。URLパラメータとCookieを組み合わせたハイブリッド方式により、ユーザーのフィルター設定を保持します。

## 実装日
2025年8月19日

## 実装方式
### ハイブリッド方式（URLパラメータ + Cookie）

1. **URLパラメータ（優先）**
   - 共有・ブックマーク可能
   - ページ間で明示的に伝達
   - Cookieより優先される

2. **Cookie（補助）**
   - URLパラメータがない場合のフォールバック
   - 30日間有効
   - ユーザーの最後の設定を記憶

## 実装ファイル

### 1. Cookie管理ライブラリ
`lib/filter-preferences-cookie.ts`
- 統一フィルターpreferences cookieの管理
- サーバー/クライアント両対応
- FilterPreferencesインターフェース定義

### 2. API エンドポイント
`app/api/filter-preferences/route.ts`
- GET: Cookie読み取り
- POST: Cookie更新（マージ方式）
- DELETE: Cookie削除

### 3. コンポーネント更新

#### SearchBox (`app/components/common/search-box.tsx`)
- 検索キーワードのCookie保存
- URLパラメータがない場合のCookie復元

#### SortButtons (`app/components/common/sort-buttons.tsx`)
- ソート順のCookie保存
- 新規作成コンポーネント

#### FilterResetButton (`app/components/common/filter-reset-button.tsx`)
- 全フィルター条件のリセット
- Cookie削除とページリロード

#### Filters (`app/components/common/filters.tsx`)
- ソースフィルターのCookie対応
- 既存のsource-filter cookieとの後方互換性

### 4. ページ更新
`app/page.tsx`
- Cookie読み取り処理の追加
- フィルターpreferences適用

## データ構造

```typescript
interface FilterPreferences {
  sources?: string[];      // 選択されたソースID
  search?: string;         // 検索キーワード
  tags?: string[];        // 選択されたタグ
  tagMode?: 'AND' | 'OR'; // タグフィルターモード
  dateRange?: string;     // 日付範囲
  sortBy?: string;        // ソート順
  viewMode?: 'grid' | 'list'; // 表示モード
  updatedAt?: string;     // 最終更新日時
}
```

## Cookie仕様
- 名前: `filter-preferences`
- 有効期限: 30日
- 形式: JSON文字列（URLエンコード）
- SameSite: lax
- Secure: production環境のみ

## テスト状況

### E2Eテスト (`__tests__/e2e/filter-persistence.spec.ts`)
- ✅ 検索条件の永続化
- ✅ 日付範囲フィルターの永続化
- ✅ 複数フィルター条件の同時永続化
- ✅ URLパラメータ優先度
- ✅ Cookie有効期限
- ⚠️ ソースフィルターの永続化（部分的）
- ⚠️ ソート順の永続化（未完成）
- ⚠️ フィルターリセット機能（改善必要）

## 既知の問題と今後の課題

### 1. ソースフィルターの永続化
- 問題: ページ遷移後にチェックボックスの状態が正しく復元されない
- 原因: Cookie値の適用タイミングの問題
- 対策案: クライアントサイドでの初期化処理の改善

### 2. ソートボタンの永続化
- 問題: アクティブ状態のスタイルが適用されない
- 原因: ボタンのvariant判定ロジック
- 対策案: SortButtonsコンポーネントの状態管理改善

### 3. フィルターリセット機能
- 問題: 検索ボックスがクリアされない場合がある
- 原因: リロードタイミングとCookie削除の非同期処理
- 対策案: リセット処理の同期化

### 4. 日付範囲フィルター
- 現状: Cookie永続化未実装
- 今後: DateRangeFilterコンポーネントの更新が必要

## 使用方法

### ユーザー視点
1. フィルター条件を設定（検索、ソース選択、ソート等）
2. 記事詳細ページへ遷移
3. トップページに戻る → フィルター条件が保持される
4. URLを共有 → 同じフィルター条件で開ける
5. リセットボタンクリック → 全条件クリア

### 開発者視点
```typescript
// Cookie読み取り（サーバーコンポーネント）
import { getFilterPreferencesFromCookies } from '@/lib/filter-preferences-cookie';
const prefs = getFilterPreferencesFromCookies(cookieStore);

// Cookie更新（クライアント）
await fetch('/api/filter-preferences', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ search: 'キーワード' })
});

// Cookie削除
await fetch('/api/filter-preferences', {
  method: 'DELETE'
});
```

## 今後の改善提案

1. **完全な永続化実装**
   - 全フィルターコンポーネントのCookie対応
   - タグフィルター、日付範囲フィルターの対応

2. **パフォーマンス最適化**
   - Cookie更新のデバウンス処理
   - 不要なリロードの削減

3. **UX改善**
   - フィルター適用中の視覚的フィードバック
   - フィルター条件のプリセット機能
   - 履歴機能（最近使用したフィルター）

4. **テスト充実**
   - 単体テストの追加
   - エッジケースのテスト
   - パフォーマンステスト

## 関連PR
- ブランチ: `feature/filter-preferences-cookie`
- コミット: `a3724a6`

## 参考資料
- [Next.js Cookies Documentation](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Auth.js Session Management](https://authjs.dev/guides/basics/session-management)