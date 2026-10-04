# #715 集計キャッシュの検証

ページと API の取得を `lib/services/trend-analysis.ts`、`trending-keywords.ts`、`dashboard-stats.ts` に集約した。キャッシュが無ければ共通の集計を実行して完全な payload を保存する。ページ側だけの部分 payload は保存しない。

`/api/tags/new` は `days`、`/api/tags/search` は既存の空白除去・200コードポイント制限後の `q` ごとに、300秒キャッシュする。検索キーにはその文字列の SHA-256 を使う。タグの個別無効化では新しい集約キーも無効化する。

トレンド分析キーは `analysis:v2:` に更新し、以前の疎な時系列を再利用しない。全体分析の欠けた日付はページと同じく0埋めする。タグ名 `all` の分析とタグ指定なしも別キーになる。

## 開発環境の応答時間

2026-10-04、既存の開発サーバーと開発 DB で HTTP GET の本文を最後まで読み取った。修正前は少数の参考測定であり、修正前の p95 は算出していない。修正後は各経路を温めてから20回測り、昇順の19番目を p95 とした。重いビルドと同時に測った値は採用していない。

| 経路 | 修正前の温まった状態の参考値 | 修正後 p50 | 修正後 p95 |
|---|---:|---:|---:|
| `/trends` | 617–760ms | 42ms | 57ms |
| `/api/tags/new` | 約512ms | 7ms | 11ms |
| `/api/tags/search?q=React` | 127–141ms | 7ms | 11ms |

本番の性能は未測定。環境負荷やキャッシュ期限によって結果は変わる。

## 結果の一致・同時アクセス・障害時

- 開発 DB で、専用の60秒 Redis キーを使って新規タグを10並列で取得した。443タグの結果が全リクエストで一致し、SQLは1回。キャッシュ後の追加SQLは0回。
- keywords と7日分析も、初回の結果と Redis から読んだ結果が一致した。
- 検証プロセスだけの Redis 接続を切断して、新規タグ・keywords・分析の集計結果の一致を確認した。稼働中の Redis サービスは停止していない。
- ロック取得前のGETとSET NXの間に別の実行がキャッシュを書き込む場合に備え、ロック取得後にも値を確認する。既存の5秒のロック待ちタイムアウト後の直接取得、Redisエラー時の直接取得を維持する。障害やタイムアウト時はDB集計が複数回になる場合がある。
- API/ページ間の period・overview/daily/tags を含む完全な payload の共有、days/qのキー分離、10並列、遅れて取得したロック、Redis障害は回帰テストでも確認した。
- 実ioredisの再接続待ちも検証した。検証プロセスだけを稼働していないローカルRedisポートに向け、ECONNREFUSEDと通常のretry後、tags/newはHTTP 200、trendsの全取得も成功した（並列実行全体2433ms）。共有のRedisサービスは停止していない。

キャッシュの鮮度はTTL運用に従う。keywords/analysisは最大30分、statsと今回のtags APIは最大5分前の値を返しうる。今回のキャッシュ追加により、tags/newの非表示変更と、両tags APIのソース有効/無効変更は、以前の即時反映から最大5分遅れる。tags/searchは以前から非表示記事も件数に含める。タグ更新・bulkの無効化は利用するが、全集計への即時無効化の拡張は今回含めない。即時反映が必要な運用では別途その経路を整える必要がある。

## 画面操作

Playwrightで `/trends` を開き、14日間 → 7日間 → 14日間と切り替えた。14日間を選んでレスポンス本文を受け取るまでの待ち時間は初回1143ms、キャッシュ後364ms（各1回、クリック処理も含む）。時系列データは同じで、page errorは0件。
修正前のブラウザ操作時間は未測定。上記のHTTP p95と、ブラウザ全体の描画・操作時間は区別する。

スクリーンショットでも概要と分析の表示を確認した。`undefined` の表示、console/page errorは検出されなかった。CSSや画面の構造は変更していない。

## 検証コマンド

`npm run lint`、`npm run type-check`、`npm run docker:build:ci`、`npm run docker:build` を実行する。関連テストは `.claude/commands/test.md` のDocker手順に従い、ページ取得・trends API・tags/search・TagCache・RedisCache・trends-cache・new-tags/tag-article-countsの実DBテストを実行する。
