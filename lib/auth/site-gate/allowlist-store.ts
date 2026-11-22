/**
 * 許可リスト（GateAllowedEmail）への追加
 *
 * 件数の上限の確認と追加を 1 つのトランザクションにし、アドバイザリロックで追加どうしを直列にする。
 * 別々に流すと、残り 1 件のときに別のアドレスの追加が同時に来て、両方とも上限を超えて入るため。
 * 本物の DB で同時に流す確かめは __tests__/lib/auth/site-gate/allowlist-store.db.test.ts
 */
import { Prisma, type PrismaClient } from '@/lib/prisma-exports';
import { env } from '@/lib/config/env';
import { GATE_ALLOWLIST_MAX_ENTRIES } from './constants';

/** 許可リストへの追加を直列にするアドバイザリロックの鍵（このテーブルの追加だけが使う） */
export const GATE_ALLOWLIST_ADD_LOCK_KEY = BigInt(0x67617465); // 'gate'

/** 一覧と追加の応答に使う列 */
export const GATE_ALLOWLIST_ENTRY_SELECT = {
  id: true,
  email: true,
  createdAt: true,
} as const;

export interface AddGateAllowedEmailInput {
  /** 正規化済みのアドレス（normalizeGateEmail） */
  email: string;
  createdById: string | null;
  /** 設定で固定したアドレス。重なる行（環境変数を変えたときに残りうる）は、一覧でも固定の扱いなので数えない */
  fixedEmails: readonly string[];
}

export interface AddedGateAllowedEmail {
  id: string;
  email: string;
  createdAt: Date;
}

/**
 * 追加した行を返す。上限に達していたら null。
 * 同じアドレスがあれば一意制約の違反（P2002）をそのまま投げる（先に探してから作ると、二重送信で違反に
 * なるため。呼び出し元が 409 にする）
 */
export async function addGateAllowedEmail(
  db: PrismaClient,
  input: AddGateAllowedEmailInput
): Promise<AddedGateAllowedEmail | null> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GATE_ALLOWLIST_ADD_LOCK_KEY})`;
      const count = await tx.gateAllowedEmail.count({
        where:
          input.fixedEmails.length > 0
            ? { email: { notIn: [...input.fixedEmails] } }
            : undefined,
      });
      if (count >= GATE_ALLOWLIST_MAX_ENTRIES) return null;
      return tx.gateAllowedEmail.create({
        data: { email: input.email, createdById: input.createdById },
        select: GATE_ALLOWLIST_ENTRY_SELECT,
      });
    },
    {
      // ロックのあとの count が先に終わった追加を見るのは、文ごとにスナップショットを取る READ COMMITTED だけ
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      // 開始の待ち（接続の取得を含む）の既定は 2 秒。DB が起きるのを待てるよう、接続の待ちと同じにする
      maxWait: env.DB_POOL_TIMEOUT * 1000,
    }
  );
}
