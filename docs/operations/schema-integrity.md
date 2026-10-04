# Schema と migration の整合性検証 (#720)

```bash
npm run db:check-schema
```

ローカルの `techtrend_dev` または `*_test` DB を検証する。通常の `DATABASE_URL` を利用し、本番モード・外部ホスト・public 以外の schema は拒否する。
接続先には、専用の一時 DB の CREATE/DROP と、migration 内の vector/pg_trgm 拡張を作成できる権限が必要。権限を自動で変更しない。

## 二段階の判定

1. **適用済み migration と DB**: `prisma migrate status` の成功に加え、一意な名前で新規作成した専用 shadow に migration を再現して `prisma migrate diff --from-migrations prisma/migrations --to-config-datasource --script --exit-code` を実行する。終了コード0を要求する。
2. **Prisma 管理対象と SQL 管理対象**: 実 DB と `schema.prisma` を比較する。Prisma が表現できない ArticleChunk HNSW の DROP 一文だけを既知の差分として区別し、他の DDL・不正な終了コードは失敗にする。shadow と実 DB の public の全索引、CHECK 制約、非内部トリガー、非拡張所有関数、view/materialized view、拡張の物理定義を比較して、Prisma が省く部分索引・関数式索引等の変更も検出する。

Prisma の管理範囲には制限があり、素の PSL 比較を「全体の差分0」とは報告しない。
現時点の素の PSL 差分は次の一文であり、**実行しない**。

```sql
DROP INDEX "idx_article_chunk_embedding_hnsw_cosine";
```

この索引は物理カタログ比較と、必要な HNSW 定義の明示検証によって保持を確認する。
Prisma の更新等で出力が変わった場合、差分を広く無視するのではなく、全文と実物を確認して検証・回帰テストを更新する。

Docker 初期化の `scripts/migration/init.sql` と `scripts/docker/init-pgvector-test.sql` は `unaccent` を追加するが、アプリの migration は利用しない。
対象 DB にだけある public の `unaccent` は bootstrap 専用の追加として INFO に出す。その他の追加、または migration 側にも存在する拡張の定義変更は例外にしない。
拡張内の関数は個別比較せず、拡張の namespace/version で比較する。

## 保持・削除する定義

- Article と Tag の重複通常索引は PR #726 の migration で削除済み。
- `Tag_name_key` と `Tag_name_lower_key` の UNIQUE は保持する。
- `uq_user_source_preset_name` の `(userId, lower(name))` UNIQUE は SQL で保持する。PSL の通常の複合 UNIQUE 宣言は実物と異なるため削除する。アプリの読み取り・更新は ID と `findFirst` を使い、複合 selector は利用していない。
- ArticleChunk の cosine HNSW と ArticleEmbedding の summary 部分 HNSW は、operator class・パラメータ・条件・valid/ready の状態も確認する。
- Session の token は `Session_token_key` の UNIQUE が索引を兼ねる。通常の `idx_session_token` だけを新規 migration で削除する。
- SocialPost.updatedAt と UserSourcePreset.sourceIds の DEFAULT は既存 migration/DB に PSL を合わせる。行データは移行しない。

新規の Session migration は、merge 後に通常の `prisma migrate deploy` を行う環境へ反映される。この作業自体は本番へ適用しない。
通常索引だけを戻す必要がある場合の DDL は次のとおり。恒久的な修正は新規 migration と schema/検証ルールで管理する。

```sql
CREATE INDEX CONCURRENTLY "idx_session_token"
ON "public"."Session"("token");
```

## 一時 DB と中断

checker は `techtrend_schema_check_<16桁のランダム値>_test` を新規作成し、その実行で作成に成功した DB だけを finally で削除する。
任意の既存 shadow DB は受け付けない。専用の `prisma/schema-check.config.ts` と子プロセス内だけの環境変数を使用し、通常の `prisma.config.ts` や `.env` は変更しない。
SIGINT/SIGTERM/SIGHUP は子プロセスを中断して後片付けに進む。SIGKILL やホスト停止では一時 DB が残る場合がある。自動で他の実行の DB を削除しない。

残った名前の読み取り例:

```sql
SELECT datname FROM pg_database
WHERE datname LIKE 'techtrend_schema_check_%_test';
```

CI の Test Suite ジョブでは、test DB の migration 適用後に同じコマンドを実行する。これは migration replay・schema・catalog の回帰検証であり、CI の成功だけで開発・本番 DB の検証済みとは扱わない。

## 検証範囲と環境

ホスト名ガードはポートフォワード先の実体を確認するものではない。接続先が実際のローカルコンテナまたは検証用サーバーであることを運用で確認する。
物理比較は記載した索引・CHECK・トリガー・通常関数/procedure・拡張・viewに限定し、RLS、GRANT、COMMENT、sequence設定、FKのvalidated/deferrableは比較しない。通常のFK/列の構造はPrisma diffで検証する。
vector等の拡張versionが新規shadowと異なれば失敗する。対象DBの更新は自動で行わず、互換性を確認してから適切なmigration/運用手順で更新する。
Prismaのshadow replay後に定義が残る挙動は7.8.0の実行で確認済み。将来の挙動が変われば失敗側に倒れる。
索引表記のfixtureは2026-10-04に開発PG17から取得したカタログ値であり、行データは含まない。実物との対応は実DBテストでも確認する。
専用configはcheckerの子プロセスから使う。環境変数を手動設定して直接呼び出す操作は、他の実行のshadowをresetしうるためサポートしない。
