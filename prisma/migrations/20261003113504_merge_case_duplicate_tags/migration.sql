-- #672: 大文字小文字だけが違うタグ（"MCP" と "Mcp" など）を 1 つに統合し、
-- lower(name) の一意インデックスで再発を防ぐ。
--
-- 全体を 1 つの DO ブロックに入れ、統合とインデックスを 1 つのトランザクションにする
-- （全部適用されるか、何も適用されないか）。Prisma の schema engine は DO を文に分けられず
-- スクリプトを丸ごと送るため、CREATE INDEX CONCURRENTLY は使えない。インデックスの作成は
-- タグ 9.3 万行で 1 秒未満。schema.prisma に式インデックスは書けないので書かない
-- （前例: 20260208130321_add_user_source_preset の uq_user_source_preset_name）。
--
-- 統合先: 同じ lower(name) の中で、記事数が最多 → 大文字（A-Z）が多い → name の C 照合順で最初。
-- 負けたタグの記事・カテゴリの対応は統合先へ移し、負けたタグは消す。
-- 消す前の状態は ops_backup スキーマに残す（戻し方は、このマイグレーションを追加した PR の説明に書く）。
DO $$
BEGIN
  -- 統合の間にタグ・リンクが書き込まれると、負けたタグに付いたリンクが DELETE の
  -- CASCADE で黙って消えるため、書き込みを止める（読み出しは止めない）
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE "Tag", "_ArticleToTag", "TagCategoryMapping" IN SHARE ROW EXCLUSIVE MODE;

  -- 統合の対応表（負けたタグ → 統合先）は一度だけ作り、バックアップも統合もこれから行う
  CREATE TEMP TABLE tag_case_merge_map ON COMMIT DROP AS
  WITH ranked AS (
    SELECT
      t.id,
      lower(t.name) AS key,
      row_number() OVER (
        PARTITION BY lower(t.name)
        ORDER BY
          (SELECT count(*) FROM "_ArticleToTag" l WHERE l."B" = t.id) DESC,
          length(regexp_replace(t.name, '[^A-Z]', '', 'g')) DESC,
          t.name COLLATE "C"
      ) AS rank
    FROM "Tag" t
    WHERE lower(t.name) IN (
      SELECT lower(name) FROM "Tag" GROUP BY lower(name) HAVING count(*) > 1
    )
  )
  SELECT loser.id AS loser_id, loser.rank AS loser_rank, winner.id AS winner_id
  FROM ranked loser
  JOIN ranked winner ON winner.key = loser.key AND winner.rank = 1
  WHERE loser.rank > 1;

  -- 重複が無ければ（テスト用の空の DB を含む）統合しないので、バックアップの表も作らない。
  -- 空の表を残すと、同じ DB にもう一度適用したときに「既にある」で失敗するため
  IF EXISTS (SELECT 1 FROM tag_case_merge_map) THEN
    CREATE SCHEMA IF NOT EXISTS ops_backup;

    -- IF NOT EXISTS は付けない。表が既にあれば全体を失敗させ、古いバックアップを
    -- 黙って残したまま統合しない
    CREATE TABLE ops_backup.tag_case_merge_20261003_tags AS
    SELECT
      t.id,
      t.name,
      t.category,
      m.loser_rank,
      m.winner_id,
      w.name AS winner_name,
      w.category AS winner_category
    FROM tag_case_merge_map m
    JOIN "Tag" t ON t.id = m.loser_id
    JOIN "Tag" w ON w.id = m.winner_id;

    -- winner_had_link: 統合前から (記事, 統合先) のリンクがあったか。戻すときに、
    -- 統合で移したリンクだけを統合先から外すために使う
    CREATE TABLE ops_backup.tag_case_merge_20261003_links AS
    SELECT
      l."A",
      l."B",
      m.winner_id,
      EXISTS (
        SELECT 1 FROM "_ArticleToTag" x WHERE x."A" = l."A" AND x."B" = m.winner_id
      ) AS winner_had_link
    FROM "_ArticleToTag" l
    JOIN tag_case_merge_map m ON m.loser_id = l."B";

    CREATE TABLE ops_backup.tag_case_merge_20261003_mappings AS
    SELECT
      c.id,
      c."tagId",
      c."categoryId",
      c."createdAt",
      m.winner_id,
      EXISTS (
        SELECT 1 FROM "TagCategoryMapping" x
        WHERE x."tagId" = m.winner_id AND x."categoryId" = c."categoryId"
      ) AS winner_had_mapping
    FROM "TagCategoryMapping" c
    JOIN tag_case_merge_map m ON m.loser_id = c."tagId";
  END IF;

  -- 統合先に category が無く、負けたタグにあれば引き継ぐ。値が違うときは、統合先を
  -- 決めたのと同じ順位で最上位の値を採る
  UPDATE "Tag" w
  SET category = s.category
  FROM (
    SELECT DISTINCT ON (m.winner_id) m.winner_id, t.category
    FROM tag_case_merge_map m
    JOIN "Tag" t ON t.id = m.loser_id
    WHERE t.category IS NOT NULL
    ORDER BY m.winner_id, m.loser_rank
  ) s
  WHERE w.id = s.winner_id AND w.category IS NULL;

  -- UPDATE で付け替えると、負けたタグ 2 つが同じ記事に付いているときに主キー違反になるので、
  -- 統合先へ INSERT して既にあるものは捨てる
  INSERT INTO "_ArticleToTag" ("A", "B")
  SELECT DISTINCT l."A", m.winner_id
  FROM "_ArticleToTag" l
  JOIN tag_case_merge_map m ON m.loser_id = l."B"
  ON CONFLICT DO NOTHING;

  -- id は DB にデフォルトが無いので明示する
  INSERT INTO "TagCategoryMapping" (id, "tagId", "categoryId", "createdAt")
  SELECT gen_random_uuid()::text, m.winner_id, c."categoryId", min(c."createdAt")
  FROM "TagCategoryMapping" c
  JOIN tag_case_merge_map m ON m.loser_id = c."tagId"
  GROUP BY m.winner_id, c."categoryId"
  ON CONFLICT DO NOTHING;

  -- 負けたタグのリンク・カテゴリの対応は CASCADE で消える
  DELETE FROM "Tag" t
  USING tag_case_merge_map m
  WHERE t.id = m.loser_id;

  CREATE UNIQUE INDEX "Tag_name_lower_key" ON "Tag" (lower(name));
END
$$;
