-- 英語のタイトルを訳さないと決めた時刻。製品名と版だけのタイトルなど、モデルが原文のまま返して
-- 訳しようがない記事に scripts/scheduled/fix-missing-translations.ts が付け、以後は翻訳の補完の対象から外す。
-- NULL 可・既定値なしの列の追加なので、表の書き直しは起きない。
-- Article は手元用ロールに表単位で SELECT を付けているので、列を足しても GRANT は要らない

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "titleTranslationSkippedAt" TIMESTAMPTZ(6);
