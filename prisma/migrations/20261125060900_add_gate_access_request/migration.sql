-- サイトの入口（Google ログイン）で未登録と拒否された人からの、利用の申請。新しい空のテーブルを足すだけで、既存のデータは変えない

-- CreateTable
CREATE TABLE "GateAccessRequest" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GateAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GateAccessRequest_email_key" ON "GateAccessRequest"("email");

-- GateAllowedEmail と同じ正規化した形（英小文字と数字のローカル部 + @gmail.com）だけを受け付ける。
-- 許可するときに、このアドレスをそのまま GateAllowedEmail へ移すため（chk_gate_allowed_email_normalized と同じ式）
ALTER TABLE "GateAccessRequest" ADD CONSTRAINT "chk_gate_access_request_email_normalized" CHECK ("email" ~ '^[a-z0-9]+@gmail\.com$');
