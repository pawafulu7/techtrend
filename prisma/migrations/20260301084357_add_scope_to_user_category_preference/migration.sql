-- CreateEnum
CREATE TYPE "PreferenceScope" AS ENUM ('home', 'digest');

-- DropIndex
DROP INDEX "uq_user_category_preference";

-- AlterTable
ALTER TABLE "UserCategoryPreference" ADD COLUMN     "scope" "PreferenceScope" NOT NULL DEFAULT 'home';

-- CreateIndex
CREATE INDEX "idx_user_category_preference_user_scope" ON "UserCategoryPreference"("userId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_category_preference" ON "UserCategoryPreference"("userId", "categoryId", "scope");
