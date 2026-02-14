-- AlterTable
ALTER TABLE "Article" ADD COLUMN "contentLength" INTEGER;

-- Backfill existing data
UPDATE "Article" SET "contentLength" = CHAR_LENGTH(content) WHERE content IS NOT NULL;

-- Trigger function: auto-sync contentLength on content change (INSERT/UPDATE)
CREATE OR REPLACE FUNCTION update_article_content_length()
RETURNS TRIGGER AS $$
BEGIN
  NEW."contentLength" := CASE
    WHEN NEW.content IS NOT NULL THEN CHAR_LENGTH(NEW.content)
    ELSE NULL
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for INSERT
CREATE TRIGGER trg_article_content_length_insert
  BEFORE INSERT ON "Article"
  FOR EACH ROW
  EXECUTE FUNCTION update_article_content_length();

-- Trigger for UPDATE (only fires when content column changes)
CREATE TRIGGER trg_article_content_length_update
  BEFORE UPDATE OF content ON "Article"
  FOR EACH ROW
  EXECUTE FUNCTION update_article_content_length();
