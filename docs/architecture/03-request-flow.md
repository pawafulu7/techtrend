# リクエスト・キャッシュ・認証フロー

`proxy.ts` の分岐、経路別の認証方式、3 経路に分かれたキャッシュの流れを示します。範囲は「ブラウザ/RSC からのリクエストが応答を返すまで」です。

## リクエストの経路

```mermaid
flowchart TD
    Browser["ブラウザ / RSC"] --> Proxy["proxy.ts"]

    Proxy --> BasicGate{"Basic gate<br/>BASIC_AUTH_ENABLED?"}
    BasicGate -->|"有効・設定不備"| Err503["503<br/>Service Unavailable"]
    BasicGate -->|"有効・資格情報不一致"| Err401["401<br/>WWW-Authenticate"]
    BasicGate -->|"無効 or 通過<br/>(basic/cookie/cron)"| Csrf{"CSRF チェック<br/>/api/* かつ変更系メソッド"}

    Csrf -->|"検証失敗"| ErrCsrf["CSRF エラー応答"]
    Csrf -->|"対象外 or 検証OK"| Maint{"メンテナンスモード<br/>MAINTENANCE_MODE?"}

    Maint -->|"有効・非管理者<br/>(role は Redis+DB 参照)"| Err503b["503<br/>メンテ画面"]
    Maint -->|"無効 or 管理者 or 除外パス"| Protected{"保護パス?<br/>/profile /favorites<br/>/history /digest<br/>/api/favorites"}

    Protected -->|"Cookie 無し"| Redirect["ログインへ<br/>redirect / 401"]
    Protected -->|"Cookie 存在<br/>(検証はしない)"| Finalize["finalize()<br/>setSecurityHeaders"]

    Finalize -.->|"basic/cookie/cron<br/>通過時のみ"| GateHeaders["private, no-store<br/>CDN-Cache-Control<br/>Vary 追加"]

    Finalize --> RouteType{"ルート種別"}
    RouteType -->|"通常通過時のみ x-theme 付与"| RSC["RSC page"]
    RouteType --> ApiRoute["API route"]

    RSC --> PublicPage["公開ページ<br/>セッション不要"]
    RSC --> ProtectedPage["保護ページ<br/>getSession()"]
    RSC --> AdminPage["管理者ページ<br/>requireAdmin()<br/>DB-backed role"]
    RSC --> ArticleDetail["記事詳細ページ<br/>ArticleDetailCache (Redis)<br/>→Prisma + ISR revalidate=60"]

    ApiRoute -->|"変更系・管理者用"| ApiWrap["withAdminAuth /<br/>withUserValidation /<br/>withRateLimit /<br/>withCSRFProtection"]
    ApiRoute -->|"公開 GET は<br/>ラッパーなしも多い"| ArticleList["記事一覧<br/>用途別Redis→miss→Prisma<br/>→DataLoaderでユーザー情報付与"]
    ApiWrap --> FavHistory["お気に入り・既読<br/>DataLoader→Redis→Prisma"]
```

### 読み方

- `proxy.ts` は全リクエスト共通の直列パイプラインではなく、**4 つの独立した条件分岐**です。各ゲートは有効化条件が異なり、無効時はスキップされます（Basic gate は `BASIC_AUTH_ENABLED` 時のみ、CSRF は `/api/*` の変更系メソッドのみ、メンテナンスは `MAINTENANCE_MODE` 時のみ、保護パスガードは対象パスのみ）。
- `finalize()` が付与する `Cache-Control: private, no-store` / `CDN-Cache-Control` / `Vary` 追加は、**Basic gate を通過したリクエスト（`gate.kind === 'basic' | 'cookie' | 'cron'`）のときだけ**実行されます。Basic 認証が無効な環境ではこれらのヘッダーは付与されません（`proxy.ts:120-146`）。
- 保護パスガード（`/profile` `/favorites` `/history` `/digest` `/api/favorites`）は**セッション Cookie の存在確認のみ**で、セッションの有効性やロールは検証していません。実際の検証は RSC 側の `getSession()` / `requireAdmin()` や API 側のラッパーで行われます。
- `setSecurityHeaders()` は `finalize()` 経由ですべての応答（503/401/リダイレクト含む）に適用されます。一方 `x-theme` ヘッダーは `finalize()` では付与されず、**ゲートに引っかからず通常通過したリクエストのときだけ**設定されます（`proxy.ts:254`）。CSRF エラー・メンテナンス 503・ログインリダイレクトには付きません。
- キャッシュは「記事一覧」「お気に入り・既読」「記事詳細」の 3 経路があり、`LayeredCache` の L1/L2/L3 は段階的フォールバック層ではなく、**すべて Redis を使う用途別キャッシュ**（L1 公開記事リスト / L2 ユーザー系 / L3 検索）です。
- **記事詳細の Redis キャッシュと ISR は RSC ページ側の仕組み**です（`app/articles/[id]/page.tsx:45` が `articleDetailCache.getArticleWithRelations()` を呼び、`:50` で `revalidate = 60` を宣言）。API 側で同じキャッシュを使うのは関連記事・関係グラフなど別ルートです。
- **すべての API がラッパーを通るわけではありません。** 例えば `app/api/articles/[id]/route.ts` の GET は素の `export async function GET` で、`withAdminAuth` + `withRateLimit` が付くのは同ファイルの PATCH / DELETE です。認証・レート制限の有無はルートごとに確認が必要です。
- DataLoader は 2 つとも**バッチ化**が主目的ですが、リクエスト内メモ化の扱いは異なります。favorite loader は DataLoader のキャッシュを有効にし（`lib/dataloader/favorite-loader.ts:221`）、view loader は `cache: false` で無効にしています（`lib/dataloader/article-view-loader.ts:135`）。

## 記事一覧取得のシーケンス

```mermaid
sequenceDiagram
    participant C as ブラウザ/RSC
    participant A as API handler<br/>(handleGet)
    participant L1 as LayeredCache<br/>(L1 公開)
    participant DB as Prisma/DB
    participant DL as DataLoader

    C->>A: GET /api/articles
    A->>L1: cache.getArticles(params, fetcher)
    L1-->>A: miss
    A->>DB: executeStandardQuery()<br/>(count + findMany)
    DB-->>A: 記事一覧
    A->>L1: キャッシュへ書き戻し
    A->>DL: fetchUserSpecificData()<br/>(favorite/view をバッチ取得)
    DL-->>A: ユーザー固有情報
    A-->>C: 記事一覧 + ユーザー情報オーバーレイ
```

補足: クライアント側の React Query（画面での再取得・キャッシュ）は本図には含めていません。ブラウザ側の再フェッチ判断は React Query が担い、上記シーケンスはサーバー内の 1 リクエスト分の流れです。

## 対応コード

| 図中の要素 | ファイル:行番号 |
|-----------|----------------|
| Basic gate 判定・503/401 応答 | `proxy.ts:79-109` |
| `finalize()`（`private, no-store` / `CDN-Cache-Control` / `Vary`） | `proxy.ts:114-150`（ヘッダー付与本体は `:132-145`） |
| CSRF チェック（`/api/*` 変更系のみ） | `proxy.ts:152-160` |
| メンテナンスモード（管理者判定は Redis キャッシュ + DB） | `proxy.ts:162-218` |
| 保護パスガード（Cookie 存在確認のみ） | `proxy.ts:220-246` |
| `setSecurityHeaders()` / `x-theme` | `proxy.ts:148`, `proxy.ts:251-254`, `config/security-headers.ts` |
| 保護ページのセッション取得 | `lib/auth/get-session.ts:4-9`（`getSession()`） |
| 管理者ページの DB-backed role 検証 | `lib/auth/admin-check.ts:12-26`（`requireAdmin()`） |
| Better Auth 設定本体 | `lib/auth/auth.ts:51-186` |
| API 用ラッパー | `lib/middleware/with-admin-auth.ts:26`、`lib/middleware/with-user-validation.ts:71`、`lib/middleware/with-rate-limit.ts:58`、`lib/middleware/csrf-protection.ts:295` |
| `LayeredCache`（L1/L2/L3 = 用途別 Redis） | `lib/cache/layered-cache.ts:37-71` |
| 記事一覧キャッシュ呼び出し | `app/api/articles/handlers/get.ts:541-543`（`cache.getArticles(params, () => executeStandardQuery(...))`） |
| ユーザー情報オーバーレイ（DataLoader） | `app/api/articles/handlers/get.ts:558-565`（`fetchUserSpecificData`） |
| DataLoader ファクトリ | `lib/dataloader/index.ts:10-19`（`createLoaders()`） |
| ユーザー情報の DataLoader（オーバーレイで使うのはこの 2 つ） | `lib/dataloader/favorite-loader.ts:221`（`cache: true`）、`lib/dataloader/article-view-loader.ts:135`（`cache: false`）。呼び出しは `app/api/articles/lib/user-data.ts:36-49` |
| 記事詳細キャッシュ | `lib/cache/article-detail-cache.ts:10-18` |
| 記事詳細ページの ISR | `app/articles/[id]/page.tsx:50`（`export const revalidate = 60`） |

## 注記

- `revalidate = 60` の ISR は記事詳細ページ（`app/articles/[id]/page.tsx`）にのみ適用されます。記事更新時は `articleDetailCache.invalidate()` から `revalidatePath` も呼ばれます（`page.tsx:49` のコメント参照）。
- クライアント側の React Query は本図の対象外です（上記シーケンス図の補足を参照）。
- `Cache-Control: private, no-store` / `CDN-Cache-Control` / `Vary` の付与は Basic gate 通過時（`gate.kind === 'basic' | 'cookie' | 'cron'`）のみで、Basic 認証が無効な構成では付与されません。
- 保護パスガード（`/profile` 等）は Cookie の**存在確認のみ**であり、セッションの有効性やロールの検証はしていません。実際の検証は各ページ・API ハンドラ側（`getSession()` / `requireAdmin()` / ラッパー）で行われます。

---
2026-08-15 時点のコードをもとに作成。更新ルールは [索引](./README.md) を参照。
