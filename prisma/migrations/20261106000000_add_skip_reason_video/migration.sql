-- AlterEnum
-- 本文の無い動画（YouTube）の記事を、取得失敗（CONTENT_FETCH_FAILED）と分けるための理由。
-- 追加した値は同じトランザクションの中では使えないので、既存の記事の付け替えは次のマイグレーションで行う
ALTER TYPE "SkipReason" ADD VALUE 'VIDEO';
