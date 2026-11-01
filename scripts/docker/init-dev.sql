-- PostgreSQL初期化スクリプト
-- Docker起動時に自動実行される

-- 日本語全文検索用の設定
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- RAG用のベクトル類似度検索
CREATE EXTENSION IF NOT EXISTS vector;

-- データベース設定
ALTER DATABASE techtrend_dev SET default_text_search_config = 'pg_catalog.simple';

-- 全文検索用の追加インデックス設定（データ投入後に実行）
-- CREATE INDEX idx_articles_title_trgm ON "Article" USING gin (title gin_trgm_ops);
-- CREATE INDEX idx_articles_summary_trgm ON "Article" USING gin (summary gin_trgm_ops);