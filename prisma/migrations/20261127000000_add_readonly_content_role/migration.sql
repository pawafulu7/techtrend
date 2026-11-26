-- 手元（ローカル・AI）の読み取り用のグループのロール。ログインはできない。手元用のログインのロールを、このロールの
-- メンバーにする（scripts/db/create-prod-roles.ts）。読めるのは scripts/db/prod-table-access.json の content の表と、
-- マイグレーションの記録の状態の列だけ（失敗のログ logs は値を含みうるので読ませない）。personal（個人情報）の表は読めない。
-- 権限はマイグレーションでだけ付け外しする。content の表を足すマイグレーションには
--   GRANT SELECT ON TABLE "<表>" TO techtrend_readonly;
-- を書き、表を personal に移すときは REVOKE するマイグレーションを書く
-- （__tests__/scripts/db/prod-table-access.db.test.ts が、一覧どおりの権限かを確かめる）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'techtrend_readonly') THEN
    CREATE ROLE techtrend_readonly NOLOGIN;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'techtrend_readonly'
      AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication)
  ) THEN
    RAISE EXCEPTION 'techtrend_readonly must be a plain NOLOGIN role';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO techtrend_readonly;

GRANT SELECT ON TABLE
  "Article",
  "ArticleChunk",
  "ArticleEmbedding",
  "ArticleInterestScore",
  "ChangelogEntry",
  "ChangelogProject",
  "ChangelogVersion",
  "CodeTip",
  "DiffSummary",
  "InterestCategory",
  "ProcessingLog",
  "Source",
  "SourceGroup",
  "SourceTag",
  "SourceTagAssignment",
  "Tag",
  "TagCategoryMapping",
  "TrendReport",
  "ViewpointMap",
  "_ArticleToTag",
  "embedding_jobs"
TO techtrend_readonly;

GRANT SELECT (id, checksum, finished_at, migration_name, started_at, rolled_back_at, applied_steps_count)
  ON TABLE "_prisma_migrations" TO techtrend_readonly;
