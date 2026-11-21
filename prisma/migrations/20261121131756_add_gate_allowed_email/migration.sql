-- サイトの入口（Google ログイン）を通ってよい Gmail アドレスの一覧。新しい空のテーブルを足すだけで、既存のデータは変えない

-- CreateTable
CREATE TABLE "GateAllowedEmail" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "GateAllowedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GateAllowedEmail_email_key" ON "GateAllowedEmail"("email");

-- CreateIndex
CREATE INDEX "idx_gate_allowed_email_created_by" ON "GateAllowedEmail"("createdById");

-- AddForeignKey
ALTER TABLE "GateAllowedEmail" ADD CONSTRAINT "GateAllowedEmail_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 正規化した形（英小文字と数字のローカル部 + @gmail.com。ローカル部のドットは除いて保存する）だけを受け付ける。
-- アプリの正規化を通らない書き込み（手で流す SQL など）で、大文字やドットの違うアドレスが一意制約をすり抜けるのを防ぐ
ALTER TABLE "GateAllowedEmail" ADD CONSTRAINT "chk_gate_allowed_email_normalized" CHECK ("email" ~ '^[a-z0-9]+@gmail\.com$');
