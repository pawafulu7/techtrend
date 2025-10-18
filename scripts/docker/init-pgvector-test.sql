-- PostgreSQL初期化スクリプト（テスト環境用）
-- Docker起動時に自動実行される

-- pgvector拡張を有効化（RAG/ベクトル類似度検索用）
CREATE EXTENSION IF NOT EXISTS vector;

-- 日本語全文検索用の設定
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- データベース設定
ALTER DATABASE techtrend_test SET default_text_search_config = 'pg_catalog.simple';
