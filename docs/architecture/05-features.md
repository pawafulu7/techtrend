# 機能一覧

TechTrend が今もっている機能を、画面・API・定期実行・CLI・外部サービス・記事ソースの順にまとめる。構成図（01〜04）が「どうつながっているか」を示すのに対し、この文書は「何ができるか」と「どこに実装があるか」を示す。件数の取り直し方は末尾の「件数の取得方法」を参照。

## 1. 利用者向けの画面

ログインが要る画面は2種類ある。

- `proxy.ts` の `protectedPaths`（`/profile`・`/favorites`・`/history`・`/digest`。前方一致）は、セッションの Cookie が無いと `/auth/login?callbackUrl=...` へ転送する
- それ以外の画面は、page の中でログインを判定する

| URL | できること | ログイン | 主な API |
|-----|-----------|---------|----------|
| `/` | 記事一覧。検索、タグ・ソース・期間での絞り込み、並び替え、カードとリストの切り替え、興味の分野での絞り込み、未読だけ・技術以外の記事の表示切り替え、全既読 | 不要（既読・興味の分野はログイン時だけ） | `/api/articles/list`（既定）、`/api/articles`（既読・興味の分野・期間で絞るとき。`lib/articles/home-articles-query.ts`） |
| `/reader` | 一覧と本文を並べて読む。絞り込みの条件はホームと共通 | 不要 | 一覧はホームと同じ、本文は `/api/articles/[id]` |
| `/articles/[id]` | 一覧要約と詳細要約、品質メーター、お気に入り、記事への Q&A、個人メモ、関連記事、同じ出来事の記事（ストーリー） | 画面は不要。Q&A・個人メモ・お気に入りはログインが要る | `/api/rag/agent-search`、`/api/comments`、`/api/articles/[id]/related`、`/api/stories/[id]`、`/api/article-views` |
| `/articles/[id]/graph` | 関連記事の関係グラフ | 不要 | `/api/articles/[id]/relationship-graph` |
| `/papers` | 論文（arXiv AI・Hugging Face Papers）だけの一覧 | 不要 | 一覧はホームと同じ |
| `/digest` | 興味の分野に合わせたダイジェスト（分野別・必読・見逃した高品質記事） | 要 | `/api/digest` |
| `/trends` | 急上昇キーワード、期間別の分析、ソースの分布 | 不要 | 初期表示は Server Component が直接集計し、期間の切り替えは `/api/trends/analysis` |
| `/trends/daily` | 日次トレンドレポート（前後の日へ移動できる） | 不要 | `/api/trends/daily` |
| `/trends/diff` | 分野別の週次の変化のまとめ | 不要 | `/api/ai/diff-summary` |
| `/trends/heatmap` | テックセクターマップ（分野から記事へ掘り下げる） | 不要 | `/api/trends/heatmap`、`/api/articles` |
| `/popular` | 人気記事のランキング | 不要 | `/api/articles/popular` |
| `/tags` | タグクラウド、タグの統計、新着タグ | 不要 | `/api/tags/cloud`・`/api/tags/stats`・`/api/tags/new` |
| `/changelog` | AI エージェントの更新情報（現在は Claude Code の CHANGELOG を翻訳したもの） | 不要 | `/api/changelog` |
| `/search/agent` | AI 検索（RAG のエージェント）。`NEXT_PUBLIC_ENABLE_AI_SEARCH` が無効なら `/` へ転送 | 要（page の中で判定） | `/api/rag/agent-search` |
| `/favorites` | お気に入りの一覧（検索・並び替え・削除） | 要 | `/api/favorites`（GET）、`/api/favorites/[articleId]`（DELETE） |
| `/favorites/feed` | 旧「お気に入りソース」（ブラウザに保存していたもの）をソースのプリセットに移し、ホームへ移る | 要 | `/api/user/source-presets` |
| `/history` | 閲覧履歴（最大100件・削除）。`?tab=analytics` で読書分析（データはブラウザの IndexedDB にあり、有効にしたときだけ記録する） | 要 | `/api/article-views` |
| `/profile` | プロフィール、パスワード変更、退会 | 要 | `/api/user/profile`・`/api/user/password`・`/api/user/delete` |
| `/contact` | 問い合わせ。ログイン中は返信先を自動で入れる | 不要 | `/api/inquiries` |
| `/auth/login`・`/auth/signup`・`/auth/verify`・`/auth/error` | メールとパスワード、Google・GitHub の OAuth | ― | `/api/auth/[...all]`（Better Auth）。メールでの新規登録は削除済みの API を呼んでいて動かない（#832） |

ルートグループの URL は、`app/(home)` が `/`、`app/favorites/(list)` が `/favorites`、`app/trends/(overview)` が `/trends` になる。

## 2. ナビゲーション

| 導線 | 定義 | 中身 |
|------|------|------|
| 主要導線 | `app/components/layout/primary-nav.ts` | ホーム・ダイジェスト・トレンド・AI 検索の4つ。AI 検索はフラグが有効でログイン中のときだけ出す（それ以外は3つ）。デスクトップはヘッダー、モバイルはボトムナビに同じ項目を出す |
| トレンドのサブナビ | `app/components/trends/TrendSubNav.tsx` | 概要・デイリー・週間変化・セクターマップ、区切りの後に人気・タグ・AI エージェント更新情報 |
| コマンドパレット（⌘K） | `app/components/layout/command-palette.tsx` | 全ページ。ログイン中はお気に入り・履歴・プロフィール、管理者には管理画面が加わる |
| ユーザーメニュー | `app/components/auth/UserMenu.tsx` | プロフィール、お気に入り、履歴、管理画面（管理者だけ） |
| 管理画面のサイドバー | `app/admin/_config/navigation.ts` | 3節の管理画面と `/sources` |

導線が細い画面:

- `/papers` へのリンクはコマンドパレットにしかない
- `/articles/[id]/graph` へは記事詳細の関連記事から入る
- `/sources` へは管理画面のサイドバーから入る

旧 URL の転送は `next.config.ts` の `redirects` にある（`/analytics` → `/history?tab=analytics`、`/stats` → `/admin/stats`、`/dashboard/*` → `/admin/*`）。

## 3. 管理画面

管理者の判定:

- 画面は `app/admin/layout.tsx`（と `app/sources/layout.tsx`）の `requireAdmin()` が行う。未ログインなら `/auth/login`、管理者でなければ `/` へ送る
- 判定に使うのは DB の `User.role`。`lib/auth/user-auth-cache.ts` が Redis に短時間キャッシュする
- API は `withAdminAuth`（`lib/middleware/with-admin-auth.ts`）で守る。未ログインは 401、管理者でなければ 403 を返す

| URL | できること |
|-----|-----------|
| `/admin` | 記事総数・有効なソース数・ユーザー数・本日の記事数 |
| `/admin/users` | ユーザー一覧、ロール（user / admin）の変更、無効化 |
| `/admin/gate-access` | サイトの入口（Google ログイン）に入れる Gmail アドレスの一覧・追加・削除。設定（`GATE_ALWAYS_ALLOWED_EMAILS`）で固定したアドレスと、管理者が今使っているアカウントは削除できない。入口で未登録と拒否された人からの利用の申請（申請者が入力した Gmail アドレスと備考）も並び、管理者が許可（許可リストに入る）か却下する（自動では許可しない）。許可すると、申請のアドレスに通知メールを送る（`lib/auth/site-gate/approval-email.ts`。送るのは申請の一覧で許可して許可リストに新しく足したときだけで、アドレスを入力して追加したとき・すでに許可されていたときは送らない。送れなくても許可は済み、画面にその旨を出す）。対応待ちの件数は管理画面のメニューに出る |
| `/admin/articles` | 記事の一覧と詳細、非表示（`isHidden`）の切り替え、要約の再生成 |
| `/admin/inquiries` | 問い合わせの一覧と状態の変更 |
| `/admin/social-posts` | X に投稿する文面の下書きを AI で作る（記事から・意見・汎用）、編集、一括操作、件数の集計。X への投稿そのものはしない |
| `/admin/stats` | 記事の統計（`/api/stats`。この API は公開） |
| `/admin/jobs` | 処理ログ、埋め込みのジョブ、記事の統計 |
| `/admin/performance` | キャッシュ・DataLoader・バッチの最適化の状態 |
| `/sources`・`/sources/[id]` | ソースの一覧と詳細 |

## 4. API（70本）

認証の凡例:

- **公開**: ラッパーなし
- **RL**: `withRateLimit` だけ
- **ログイン**: `withUserValidation`（未ログインは 401）
- **管理者**: `withAdminAuth`

書き込みのメソッドには、`proxy.ts` が CSRF の検査をかける（`/api/auth` と `/api/health` は対象外）。

サイトの入口が有効なときは、どの API も `proxy.ts` が先に入口のログイン状態を確かめる（無ければ 401、許可リストから外されていれば 403。JSON の `code` は `GATE_SESSION_REQUIRED`・`GATE_NOT_ALLOWED`）。例外は入口の開始・戻り・拒否のページの GET と、アプリ内のログアウト（`POST /api/auth/sign-out`。入口が切れていてもログアウトできるように）。

以下の表の route は、先頭の `app/api/` を省いている。

| 分類 | route | メソッドと認証 |
|------|-------|---------------|
| 記事 | `articles`、`articles/list`、`articles/[id]`、`articles/[id]/related`、`articles/[id]/relationship-graph`、`articles/categories` | GET 公開 |
| | `articles/popular`、`stories/[id]` | GET RL |
| 既読・閲覧 | `articles/read-status` | GET・POST・PUT・DELETE ログイン |
| | `article-views` | GET・POST・DELETE ログイン |
| お気に入り・個人メモ | `favorites` | GET ログイン |
| | `favorites/[articleId]` | GET 公開（中でセッションを読む）、POST・DELETE ログイン |
| | `favorites/batch` | POST ログイン |
| | `comments`、`comments/[id]`（画面上の「個人メモ」） | すべてログイン |
| タグ | `tags/cloud`、`tags/search` | GET RL |
| | `tags/new`、`tags/stats` | GET 公開 |
| トレンド | `trends/analysis`、`trends/daily` | GET 公開 |
| | `trends/heatmap`、`ai/diff-summary` | GET RL |
| AI 検索・ダイジェスト | `rag/agent-search` | POST ログイン |
| | `digest` | GET ログイン |
| ユーザー設定 | `user/profile`、`user/password`、`user/delete`、`user/preferences/categories`、`user/source-presets`、`user/source-presets/[id]` | ログイン |
| | `interest-categories` | GET 公開 |
| | `filter-preferences`、`source-filter`、`view-mode` | 公開（Cookie の読み書き） |
| その他 | `inquiries` | POST RL（ログインは任意） |
| | `changelog` | GET RL |
| | `auth/[...all]` | Better Auth |
| サイトの入口 | `gate/start` | GET 公開（IP ごとに 30 回/分。Google のログインへ移す） |
| | `gate/[...all]` | GET 公開。Google からの戻り（`gate/callback/google`）だけを入口用の Better Auth に渡し（IP ごとに 30 回/分）、拒否・失敗のページ（`gate/error`）は自前の日本語の HTML を、拒否・失敗の直後（1 分の目印の Cookie）だけ返し、URL を直接開いたら開始へ移す（`lib/auth/site-gate/error-page.ts`・`error-notice.ts`）。未登録（`not_allowed`）で拒否したアカウントが分かるときは、利用の申請のフォームを出す（申請済みならその旨。拒否のページは IP ごとに 30 回/分、ポリシー `auth:gate-error`）。ほかは 404 |
| | `gate/request` | POST 公開（IP ごとに 10 回/時、ポリシー `write:gate-request`）。拒否のページのフォームからの利用の申請。送れるのは、拒否した応答に付けた署名付きの Cookie（`lib/auth/site-gate/request-account-cookie.ts`。Google で選んだアカウント。30 分）を持つ人だけ。本文は、申請する Gmail アドレス（フォームには拒否されたアカウントが入っていて、書き換えられる）と備考を受ける。書き換えたアドレス（Google にログインした本人のものでないアドレス）では、先に届いている申請を変えず、そのアドレスが許可済みか・申請済みかで応答を変えない。書き換えた申請は、Google で選んだアカウントごとに 1 日 3 件まで（ポリシー `write:gate-request-edited`）。許可済みかの確認と保存は、許可・却下と同じロックの 1 つのトランザクションで行う。応答は HTML のページ。入口が無効なら 404 |
| 管理 | `admin/*`（23本。`admin/gate-allowlist`・`admin/gate-allowlist/[id]`、利用の申請の `admin/gate-requests`（一覧）・`admin/gate-requests/[id]`（却下）・`admin/gate-requests/[id]/approve`（許可）を含む） | 管理者 |
| | `sources` | GET 管理者 |
| | `stats` | GET RL（公開） |
| 監視 | `health` | GET 公開（Docker の healthcheck） |
| | `cache/stats`、`metrics/batch-optimizer` | GET 管理者（`/admin/performance` が使う） |
| | `telemetry/vitals` | POST RL（Web Vitals の送信）、GET 管理者 |

## 5. 定期実行（GitHub Actions）

すべての `scheduler-*.yml` に共通すること:

- `npx tsx scripts/...` を本番 DB に対して直接実行する。API は呼ばない
- 失敗したときは `SLACK_WEBHOOK_URL` に通知する
- `confirm=YES` を付けて手動でも実行できる

| workflow | cron（UTC） | JST | 実行するもの | 内容 |
|----------|------------|-----|-------------|------|
| `scheduler-rss-hourly` | `0 * * * *` | 毎時 0 分 | `collect-feeds.ts` | RSS 系ソースの収集と要約の生成 |
| `scheduler-scraping` | `30 15 * * *`、`30 3 * * *` | 0:30、12:30 | `collect-feeds.ts` → `manage-summaries.ts` → `manage-quality-scores.ts` | スクレイピング・ニュースレターの収集 |
| `scheduler-qiita` | `5 20 * * *`、`5 8 * * *` | 5:05、17:05 | 同上の3段 | Qiita の収集 |
| `scheduler-embedding-worker` | `*/30 * * * *` | 30 分ごと | `recover-stuck-embeddings.ts` → `run-embedding-worker.ts` → `assign-stories.ts` | 埋め込みの生成と、同じ出来事の記事のまとめ |
| `scheduler-off-topic` | `40 * * * *` | 毎時 40 分 | `classify-off-topic.ts` | 技術者向けでない記事の判定 |
| `scheduler-tags` | `30 23 * * *`、`30 11 * * *` | 8:30、20:30 | `generate-tags.ts` | タグの生成 |
| `scheduler-daily-quality` | `0 2 * * *` | 11:00 | `manage-quality-scores.ts` | 品質スコアの計算 |
| `scheduler-quality-auto` | `30 6 * * *` | 15:30 | `quality-check.ts` → `auto-regenerate-low-quality.ts` → `manage-summaries.ts missing` | 要約の品質の集計、低品質な要約の作り直し、欠けた要約の補完 |
| `scheduler-translation-fix` | `30 */4 * * *` | 1:30 から 4 時間ごと | `fix-missing-translations.ts` | 翻訳漏れの補修 |
| `scheduler-trend-report` | `30 5 * * *` | 14:30 | `generate-trend-report.ts` | 日次トレンドレポート |
| `scheduler-diff-summary` | `0 21 * * 0` | 月曜 6:00 | `generate-diff-summaries.ts` | 週次の変化のまとめ（終わったら Redis のキーを消す） |
| `scheduler-changelog` | `15 3 * * *` | 12:15 | `collect-changelog.ts` | Claude Code の CHANGELOG の取り込みと翻訳 |
| `scheduler-cleanup` | `0 17 * * 5` | 土曜 2:00 | `clean-tags.ts` | タグの統合と掃除 |
| `ai-regression-test` | `0 0 * * 0`、関係する PR | 日曜 9:00 | `scripts/ci/run-golden-set-regression.ts` | ゴールデンセットでの要約の回帰テスト |
| `tag-quality-check` | `0 0 * * 0` | 日曜 9:00 | `scripts/scheduled/check-tag-quality.ts` | CI の中のテスト DB でタグの品質を確かめる（本番のデータは見ない） |

## 6. CLI と手動のスクリプト

`npm run techtrend -- <コマンド>`（`lib/cli/index.ts`）で動かす。ローカルの DB を使うときは `npx dotenv run -- tsx lib/cli/index.ts <コマンド>` のように env を読み込ませる。

| コマンド | サブコマンド |
|---------|-------------|
| `feeds` | `collect`・`sources`・`stats` |
| `summaries` | `generate`・`regenerate`・`check` |
| `quality-scores` | `calculate`（`--recalculate` で採点済みの記事も計算し直す）・`fix`・`stats` |
| `tags` | `list`・`stats`・`clean`・`categorize` |
| `cleanup` | `tags`・`stats` |
| `db` | `stats` |

手動で使う npm script のうち、要約に関わるもの:

- `add-article`: URL を指定して記事を追加する
- `regenerate:low-quality`: 要約生成と同じ判定（`lib/ai/service/quality-checker.ts`）で低品質な要約を持つ記事を作り直す（定期実行の `auto-regenerate-low-quality.ts` は記事の品質スコアで選ぶので、選び方が違う）
- `regenerate:all-unified`: 統一フォーマットより前の版の要約を作り直す

どれも、定期実行と同じ要約サービス（`lib/ai/service/`）で要約を作る。

## 7. 外部サービス

| 種類 | 用途 | 設定（環境変数） |
|------|------|-----------------|
| Gemini | 要約・タグ・翻訳・抽出・トレンドレポート・X 投稿の下書き。既定のモデルは `lib/di/config.ts` と `lib/constants/index.ts`（トレンドレポートは別のモデル） | `GEMINI_API_KEY`、`GEMINI_MODEL`、`GEMINI_BASE_URL`、`GEMINI_SUMMARY_SERVICE_TIER` |
| OpenAI | 埋め込み（`text-embedding-3-small`）と AI 検索・Q&A のエージェント | `OPENAI_API_KEY`、`EMBEDDING_MODEL`、`AGENT_MODEL`、`RAG_ENABLED` |
| メール | Better Auth のメールアドレスの確認と、サイトの入口の利用の申請を許可した知らせの 2 つ。nodemailer（Gmail か SMTP）があればそれを、無ければ Resend を使う（`lib/email/mailer.ts`） | `EMAIL_FROM`、`GMAIL_USER`・`GMAIL_APP_PASSWORD`、`SMTP_*`、`RESEND_API_KEY` |
| OAuth | Google と GitHub。設定があるときだけ有効 | `GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET`、`GITHUB_CLIENT_ID`・`GITHUB_CLIENT_SECRET` |
| Slack | 定期実行の失敗と、新しい要約の通知（`lib/notification/`） | `SLACK_WEBHOOK_URL`、`SLACK_NOTIFICATION_ENABLED` |
| PostgreSQL・Redis | データとキャッシュ・レート制限 | `DATABASE_URL`、`REDIS_URL` |
| Qiita API | Qiita の記事の取得 | `QIITA_API_TOKEN` |
| 入口の制御 | サイト全体の入口（Google ログインと許可リスト。Vercel の Production では `GATE_GOOGLE_ENABLED` が未設定でも有効とみなし、外すには `false` を明示する）、メンテナンスモード、AI 検索のフラグ | `GATE_GOOGLE_ENABLED`、`GATE_GOOGLE_CLIENT_ID`・`GATE_GOOGLE_CLIENT_SECRET`、`GATE_AUTH_SECRET`、`GATE_ALWAYS_ALLOWED_EMAILS`、`MAINTENANCE_MODE`、`NEXT_PUBLIC_ENABLE_AI_SEARCH` |

## 8. 記事ソースの取得方式

ソースの実体は DB の `Source` テーブルで、取得の処理は `lib/fetchers/index.ts` の `createFetcher` がソース名で選ぶ。

| 取得方式 | 実装 | 例 |
|---------|------|----|
| RSS（設定だけで足す汎用の fetcher） | `lib/fetchers/generic-foreign-rss.ts` | 海外の企業・技術ブログ、技術メディア |
| 国内企業のテックブログ（RSS） | `lib/fetchers/corporate-blogs/` | DeNA、SmartHR、ZOZO など |
| ニュースレター（号の本文から記事のリンクを取り出す） | `lib/fetchers/curated-newsletter/` | JavaScript Weekly、SRE Weekly など |
| 個別の RSS | `lib/fetchers/*.ts` | AWS、Zenn、OpenAI Blog など |
| API（JSON・GraphQL） | `lib/fetchers/*.ts` | Dev.to、Qiita、Hacker News、Hugging Face Papers など |
| HTML のスクレイピング（cheerio） | `lib/fetchers/*.ts` | Claude Blog、Anthropic News、Forbes Japan など（Speaker Deck・Docswell は RSS と併用） |

フィードの取得（`lib/fetchers/fetch-feed.ts`）・fetcher の基底（`lib/fetchers/base.ts`）・ニュースレターのリンク解決・enricher の記事ページの取得は、SSRF の検証（`lib/utils/url/safe-redirect.ts`）を通す。API の fetcher の一部（Dev.to など）は検証を通さずに直接取りに行く。記事を保存した後に、enricher（`lib/enrichers/`）が記事ページから本文やサムネイルを補う（`scripts/scheduled/collect-feeds.ts`）。

## 件数の取得方法

2026-11-25 時点の値と、取り直すときのコマンド。

| 項目 | 値 | コマンド |
|------|----|---------|
| 画面（page.tsx） | 35 | `find app -name page.tsx \| wc -l` |
| API（route.ts） | 70 | `find app/api -name route.ts \| wc -l` |
| 定期実行 | 14 | `ls .github/workflows/scheduler-*.yml \| wc -l` |
| `createFetcher` のソース名 | 87 | `grep -cE "^\s+case '" lib/fetchers/index.ts` |
| model | 35 | `grep -c '^model ' prisma/schema.prisma` |
