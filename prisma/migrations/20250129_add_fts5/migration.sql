-- CreateTable FTS5 for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  id UNINDEXED,
  title,
  summary,
  content,
  tags,
  source,
  publishedAt UNINDEXED,
  difficulty,
  content=Article,
  tokenize='unicode61'
);

-- Populate FTS table with existing data
INSERT INTO articles_fts (id, title, summary, content, tags, source, publishedAt, difficulty)
SELECT 
  a.id,
  a.title,
  COALESCE(a.summary, ''),
  COALESCE(a.content, ''),
  GROUP_CONCAT(t.name, ' '),
  s.name,
  a.publishedAt,
  COALESCE(a.difficulty, '')
FROM Article a
LEFT JOIN Source s ON a.sourceId = s.id
LEFT JOIN _ArticleToTag at ON a.id = at.A
LEFT JOIN Tag t ON at.B = t.id
GROUP BY a.id;

-- Create triggers to keep FTS table in sync
CREATE TRIGGER IF NOT EXISTS article_ai AFTER INSERT ON Article BEGIN
  INSERT INTO articles_fts (id, title, summary, content, tags, source, publishedAt, difficulty)
  SELECT 
    new.id,
    new.title,
    COALESCE(new.summary, ''),
    COALESCE(new.content, ''),
    '',
    (SELECT name FROM Source WHERE id = new.sourceId),
    new.publishedAt,
    COALESCE(new.difficulty, '');
END;

CREATE TRIGGER IF NOT EXISTS article_ad AFTER DELETE ON Article BEGIN
  DELETE FROM articles_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS article_au AFTER UPDATE ON Article BEGIN
  UPDATE articles_fts 
  SET 
    title = new.title,
    summary = COALESCE(new.summary, ''),
    content = COALESCE(new.content, ''),
    source = (SELECT name FROM Source WHERE id = new.sourceId),
    publishedAt = new.publishedAt,
    difficulty = COALESCE(new.difficulty, '')
  WHERE id = new.id;
END;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON Article(publishedAt);
CREATE INDEX IF NOT EXISTS idx_articles_source_id ON Article(sourceId);
CREATE INDEX IF NOT EXISTS idx_articles_difficulty ON Article(difficulty);
CREATE INDEX IF NOT EXISTS idx_articles_quality_score ON Article(qualityScore);