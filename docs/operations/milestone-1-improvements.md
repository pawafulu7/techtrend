# マイルストーン1の改善と検証

対象: #713 / #705 / #708 / #720。検証日: 2026-10-04。

## PostgreSQL の共有メモリ (#713)

`docker-compose.dev.yml` / `docker-compose.app.yml` / `docker-compose.test.yml` の PostgreSQL に `shm_size: "1g"` を指定する。
開発環境では `docker compose -f docker-compose.dev.yml up -d --no-deps --wait postgres` で、既存のデータボリュームを保持して反映した。

開発サーバーの `/api/tags/new?days=7` に、10並列で計20リクエストを送った結果:

| 状態 | 200 | 500 |
| --- | ---: | ---: |
| 変更前 (64MB) | 4 | 16 |
| 変更後 (1GB) | 20 | 0 |
| 集計・索引の修正後 (1GB) | 20 | 0 |

本番 DB の提供元と共有メモリ設定は未確認。環境にある接続先は開発 DB のみで、構成資料にも提供元の記述が混在している。
本番の接続先で `SELECT version(); SHOW max_parallel_workers_per_gather;` と、提供元の設定を確認する必要がある。
本番が Compose の PostgreSQL を使う場合は、この変更を適用してコンテナを再作成する。

## 表示と集計 (#705 / #708)

- セクターマップは既存の日本語辞書と記事分類の補完辞書で表示する。未知の分類は「その他」。分類の検索キーは維持する。
- 認証方法は better-auth の `credential` 定数で表示し、パスワード認証の重複を除く。「Twitter」は「X（Twitter）」に変更する。
- AI の本文に混ざる `（A7）` / `(A8)` / `[A9]` 等は生成時と表示時に除く。既存レポートも表示時に対応し、記事 ID の配列と関連記事リンクは保持する。
- 主要16タグに表示名と検索用の別名を定義する。DB の正式名、カテゴリ判定、クリック時の検索キーは維持する。別名検索は読み取り時に正式名へ展開する。
- 人気画面の投票タブ・数値・説明・API の metric・スコアへの加算を削除する。API の `metric=votes` は400、旧画面 URL は総合表示に戻す。
- 「保存」は「元サイトの反応」に変更し、はてなブックマーク・Dev.to・Hacker News で意味が異なる旨を表示する。総合スコアは反応40%、品質40%、新しさ20%。
- 新着タグは有効なソースの可視記事だけで初出を判定する。期間は `[from, to)`。非表示・無効ソースの過去記事は初出とみなさない。API と Server Component が同じ関数を使う。
- `/trends` の新着は24時間・上位10件、`/tags` の統計は7日・全件という表示範囲は維持する。同じ期間を比較する場合は `/api/tags/new?days=1` の先頭10件と `/api/trends/keywords` の `newTags` を比較する。
- 集計変更前のキャッシュを返さないよう、heatmap / keywords / popular のキーまたは名前空間を更新する。

## 重複索引 (#720)

開発 DB とテスト DB で、20261004030000〜20261004030006 の新規マイグレーションを適用済み。
Article の `idx_article_*` の定義は残し、重複する `Article_publishedAt_idx` / `Article_createdAt_idx` / `Article_qualityScore_idx` / `Article_sourceId_idx` / `Article_sourceId_publishedAt_idx` を削除する。
Tag の `Tag_name_idx` / `idx_tag_name` を削除し、`Tag_name_key` と `Tag_name_lower_key` の UNIQUE は保持する。

この環境の Prisma PostgreSQL adapter は複数文をまとめて送信するため、複数の `DROP INDEX CONCURRENTLY` を同じ SQL ファイルに書くと暗黙のトランザクションになり失敗する。
そのため、マイグレーションごとに DROP を一文だけ記載する。既存マイグレーションは変更しない。

開発 DB で `pg_index` の定義を比較した結果、Article と Tag の重複した通常索引は0組。Tag の名前に対する UNIQUE 索引は2本残っている。
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code` に Article / Tag の差分はない。

ただし、DB 全体の diff は終了コード2となり、以下の既存差分が残る。#720 の「DB 全体の差分なし」は未達成として扱う。
これらは今回の索引修正の対象外で、検索用 ANN 索引の削除などを含むため、diff の SQL をそのまま適用しない。

- `idx_article_chunk_embedding_hnsw_cosine` と `idx_session_token` が schema に表現されていない。
- `SocialPost.updatedAt` と `UserSourcePreset.sourceIds` の DEFAULT が schema と異なる。
- `uq_user_source_preset_name` が DB に存在しない。

## 検証結果

Docker 本番ビルド、TypeScript、変更コードの ESLint、git diff の空白検査は成功。
関連 Node/API/実 DB テスト77件、Reactコンポーネントテスト105件、タグサービス結合テスト10件が成功。
Chromium / Firefox の E2E は計10件成功し、内部スラッグ・provider ID・本文の参照 ID が表示されないこと、旧投票 URL の表示、新着タグの同一期間での一致、並列アクセスを検証した。
E2E はテスト専用 DB に fixture を作成し、終了時に削除・元のレポートを復元する。既存の開発サーバーを変更せず、Docker 内の本番ビルドのアプリで検証した。
