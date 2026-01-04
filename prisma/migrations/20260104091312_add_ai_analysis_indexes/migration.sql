-- CreateIndex
CREATE INDEX "idx_code_tip_quality" ON "CodeTip"("quality" DESC);

-- CreateIndex
CREATE INDEX "idx_diff_summary_category_slug" ON "DiffSummary"("categorySlug");
