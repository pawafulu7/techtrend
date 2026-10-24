-- ホームとダイジェストで分けていた興味の分野の設定を 1 つにする（Issue #709）。
-- 分野の設定は共通にし、ホームの一覧を絞り込むかどうかは User に別に持つ。

-- 1. ホームの絞り込みのオン/オフ。今までは「ホームの分野が 1 つ以上あればオン」だったので、その人はオンにする。
--    ダイジェストだけ設定していた人はオフのまま（分野を共通にしても、ホームの一覧は今までどおり絞り込まない）
ALTER TABLE "User" ADD COLUMN "homePersonalizationEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" AS u
SET "homePersonalizationEnabled" = true
WHERE EXISTS (
  SELECT 1 FROM "UserCategoryPreference" AS p
  WHERE p."userId" = u."id" AND p."scope" = 'home'
);

-- 2. ダイジェストにしか無い分野をホームの側に寄せる（和集合）。両方にある分野はホームの行を残し、ダイジェストの行を消す
UPDATE "UserCategoryPreference" AS d
SET "scope" = 'home'
WHERE d."scope" = 'digest'
  AND NOT EXISTS (
    SELECT 1 FROM "UserCategoryPreference" AS h
    WHERE h."userId" = d."userId"
      AND h."categoryId" = d."categoryId"
      AND h."scope" = 'home'
  );

DELETE FROM "UserCategoryPreference" WHERE "scope" = 'digest';

-- 3. scope の列と型を消し、一意制約を (userId, categoryId) に戻す
DROP INDEX "idx_user_category_preference_user_scope";

DROP INDEX "uq_user_category_preference";

ALTER TABLE "UserCategoryPreference" DROP COLUMN "scope";

DROP TYPE "PreferenceScope";

CREATE UNIQUE INDEX "uq_user_category_preference" ON "UserCategoryPreference"("userId", "categoryId");
