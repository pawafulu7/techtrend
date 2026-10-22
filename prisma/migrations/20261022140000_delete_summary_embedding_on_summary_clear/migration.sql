-- 一覧要約（summary）を空・NULL にしたら、その要約から作った埋め込み（embeddingKey = 'summary'）を消す。
-- 要約を消す経路は収集の本文差し替え・保守スクリプト・記事の API に散っているので、DB で一か所にまとめる。
-- タイトルの埋め込みは要約と関係しないので残す
CREATE OR REPLACE FUNCTION delete_summary_embedding_on_summary_clear()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM "ArticleEmbedding"
  WHERE "articleId" = NEW.id
    AND "embeddingKey" = 'summary';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- summary 列を SET した UPDATE だけで動く。要約があった記事を空・NULL にしたときだけ消す
CREATE TRIGGER trg_article_summary_clear_delete_embedding
  AFTER UPDATE OF summary ON "Article"
  FOR EACH ROW
  WHEN (COALESCE(NEW.summary, '') = '' AND COALESCE(OLD.summary, '') <> '')
  EXECUTE FUNCTION delete_summary_embedding_on_summary_clear();

-- 要約が空・NULL の記事には、要約の埋め込みを書かない。埋め込みのワーカーは記事をジョブごと取得してから
-- 埋め込むので、取得の後に要約が消されると、消した要約の埋め込みを書き戻してしまう。
-- 記事の行を FOR SHARE で読むので、要約を消す更新の途中なら、その確定を待ってから判定する
CREATE OR REPLACE FUNCTION skip_summary_embedding_without_summary()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."embeddingKey" = 'summary' THEN
    PERFORM 1
    FROM "Article"
    WHERE id = NEW."articleId"
      AND COALESCE(summary, '') <> ''
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_article_embedding_skip_without_summary
  BEFORE INSERT OR UPDATE ON "ArticleEmbedding"
  FOR EACH ROW
  EXECUTE FUNCTION skip_summary_embedding_without_summary();
