# E2E `data-testid` 命名規則

Issue #611 で導入。E2E (`e2e/**`) は **`data-testid` プライマリ**でセレクタを記述する。Tailwind utility class や CSS Modules class への依存はデザイントークン化やコンポーネントリネームで連鎖失敗するため使用しない（PR #609 の経緯を参照）。

## 1. 表記

- kebab-case — 半角英小文字、数字、ハイフンのみを使用（例: `error-message`, `stat-card`）
- 大文字 / アンダースコア / キャメルケースは不可（`Button`, `error_message`, `errorMessage` などは禁止）

## 2. 粒度サフィックス

レベル区分を明示するため、目的別に以下のサフィックスを使い分ける。

| サフィックス | 用途 | 例 |
|-------------|------|-----|
| `-content` | ページ全体・大きなセクションの wrapper | `analytics-content`, `search-results` |
| `-card` | カード状の child 要素群（複数表示） | `article-card`, `stat-card` |
| `-item` | リスト/集合の個別要素 | `tag-item` |
| `-value` | 個別の数値・テキスト値 | `stats-value`, `pagination-current` |
| `-label` | 短いラベル文字列要素（`-item` ほど構造を持たない） | `article-title`, `article-date` |
| `-message` | ユーザー向けメッセージ | `error-message`, `empty-state-message` |
| `-button` | 操作ボタン | `pagination-next`, `theme-toggle-button` |
| `-spinner` / `-skeleton` | ローディング表示 | `loading-spinner`, `tag-cloud-skeleton` |
| `-container` | 単一の枠だけの wrapper | `chart-container` |

## 3. ドメイン名 + サフィックス

`<domain>-<suffix>` の組合せで命名する。同種カテゴリ間ではできる限り同じサフィックスで揃える。

例外: 既存実装にすでに付与されている testid は破壊的リネームを避けるため維持する（例: `article-source` は `article-` prefix で記事関連を表現しており、4 箇所に既存付与あり）。

## 4. 主要 testid 一覧（Issue #611 で追加分）

| testid | 付与先 | 役割 |
|--------|--------|------|
| `error-message` | エラー表示要素 | エラーメッセージ。`role="alert"` 併用 |
| `empty-state` | 空状態 wrapper | 検索 0 件・お気に入り 0 件など |
| `loading-spinner` | ローディング表示 | スピナー / スケルトン |
| `success-message` | 成功通知要素 | 成功メッセージ（toast / inline alert）。`role="status"` または `aria-live="polite"` 併用 |
| `article-source` | ソースラベル | 記事のソース（Hatena Bookmark 等）。既存 testid 維持 |
| `tag-item` | タグ要素 | 記事タグ・タグ一覧の各要素 |
| `article-title` | 記事カード内タイトル | 記事カードの `<h2>` 等 |
| `article-summary` | 記事カード内要約 | 記事カードの要約段落 |
| `article-date` | 記事カード内日付 | `<time>` 要素 |
| `analytics-content` | 分析ページ wrapper | 分析セクション全体 |
| `stat-card` | 統計カード | 個別の統計カード |
| `stats-value` | 統計値 | 数値表示要素 |
| `chart-container` | グラフ wrapper | recharts 等のチャート枠 |

既存 testid（`article-card`, `pagination-*`, `theme-*`, `search-*` 等）は維持する。

## 5. 禁止事項

### 5.1 shadcn/ui プリミティブへの直接付与禁止

`CardTitle`, `CardContent`, `CardHeader`, `Button`, `Input`, `Badge`, `Label` など shadcn/ui プリミティブには **直接** `data-testid` を渡さない。理由:

- 同じプリミティブが複数ページで使われると testid が一意でなくなり、locator が曖昧になる
- shadcn/ui のバージョン差で props の伝播挙動が変わる可能性

✅ 推奨: ドメインラッパー（例: `app/components/article/card.tsx`）の中の具体 HTML 要素（`<h2>`, `<p>`, `<time>`）に付与
❌ 非推奨: `<CardTitle data-testid="article-title">...</CardTitle>`

### 5.2 testid を CSS スタイリングに使用しない

`[data-testid="..."]` を CSS / Tailwind の attribute selector として使わない。テスト識別と表現を分離する。

## 6. ARIA との併用

a11y 観点で意味がある要素は ARIA role / live region を併用する。

| testid | 推奨併用 ARIA | 条件 |
|--------|--------------|------|
| `error-message` | `role="alert"` | 常時 |
| `empty-state` | `role="status"` | **動的更新（フィルタ変更・検索後）で空になるケースのみ**。静的な初期表示は付与しない |
| `loading-spinner` | `aria-label="読み込み中"` | スクリーンリーダー対応 |
| `success-message` | `role="status"` または `aria-live="polite"` | 成功通知（保存完了・更新完了等） |

## 7. 同種要素が複数表示される場合

リスト等で同じ testid が複数現れるケースは、Playwright の `.nth(i)` / `.first()` / `.locator(..., { hasText: ... })` で識別する。

testid に index を入れない（例: `tag-item-0`, `tag-item-1` は不可）。データ駆動の識別子を入れる必要がある場合は別属性 `data-testid-id` を使う。

```html
<a data-testid="tag-item" data-testid-id="javascript">JavaScript</a>
```

## 8. E2E セレクタの記述方針

- selectors.ts は `data-testid="..."` 単独を原則。a11y 上 ARIA fallback が自然な要素のみ `[data-testid="..."], [role="..."]` の OR を許容
- class substring (`[class*="..."]`) は使用禁止（DoD で `rg -n 'class\\*=' e2e/` が 0 件であること）
- Tailwind utility class 直接指定（`.text-red-500` 等）は使用禁止

## 関連

- Issue: #611
- 経緯 PR: #609 (Closes #603 デザイントークン全廃)
- 計画書: `.workflow/docs/plan/plan_20260426_122316_192_e2e_data_testid_migration.md`
