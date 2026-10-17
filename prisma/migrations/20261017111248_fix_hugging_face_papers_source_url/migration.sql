-- Hugging Face Papers の Source.url を、止まった取得先（公開の RSSHub。403 を返す）から
-- Hugging Face の Daily Papers のページに直す。ソース詳細画面の「サイトを見る」がこの URL を開く。
-- 取得は lib/fetchers/ai/huggingface-papers.ts が API から行い、この列は使わない。
-- id と旧 URL の両方を条件にするので、行が無い・すでに直っている DB では 0 行の更新で終わる。
UPDATE "Source"
SET "url" = 'https://huggingface.co/papers',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'cmfxa7efj0000teo06dhbox6e'
  AND "url" = 'https://rsshub.app/huggingface/daily-papers';
