/**
 * 許可リスト（GateAllowedEmail）への追加と、利用の申請（GateAccessRequest）の許可・却下
 *
 * 件数の上限の確認と追加を 1 つのトランザクションにし、アドバイザリロックで追加どうしを直列にする。
 * 別々に流すと、残り 1 件のときに別のアドレスの追加が同時に来て、両方とも上限を超えて入るため。
 * 本物の DB で同時に流す確かめは __tests__/lib/auth/site-gate/allowlist-store.db.test.ts
 */
import { Prisma, type PrismaClient } from '@/lib/prisma-exports';
import { env } from '@/lib/config/env';
import { GATE_ALLOWLIST_MAX_ENTRIES } from './constants';

/** 許可リストへの追加と、利用の申請の保存・許可・却下を直列にするアドバイザリロックの鍵 */
export const GATE_ALLOWLIST_ADD_LOCK_KEY = BigInt(0x67617465); // 'gate'

/** 一覧と追加の応答に使う列 */
export const GATE_ALLOWLIST_ENTRY_SELECT = {
  id: true,
  email: true,
  createdAt: true,
} as const;

/** ロックを取るトランザクションの設定（利用の申請の保存 access-request-store.ts も使う） */
export const GATE_ALLOWLIST_TRANSACTION_OPTIONS = {
  // ロックのあとの count が先に終わった追加を見るのは、文ごとにスナップショットを取る READ COMMITTED だけ
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  // 開始の待ち（接続の取得を含む）の既定は 2 秒。DB が起きるのを待てるよう、接続の待ちと同じにする
  maxWait: env.DB_POOL_TIMEOUT * 1000,
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
      const created = await tx.gateAllowedEmail.create({
        data: { email: input.email, createdById: input.createdById },
        select: GATE_ALLOWLIST_ENTRY_SELECT,
      });
      // 同じアカウントから利用の申請が届いていたら、対応済みとして消す（一覧に残さない）
      await tx.gateAccessRequest.deleteMany({ where: { email: input.email } });
      return created;
    },
    GATE_ALLOWLIST_TRANSACTION_OPTIONS
  );
}

export interface ApproveGateAccessRequestInput {
  /** 申請（GateAccessRequest）の ID */
  requestId: string;
  approvedById: string | null;
  fixedEmails: readonly string[];
}

export type ApproveGateAccessRequestResult =
  /** 許可リストに足して、申請を消した */
  | { status: 'approved'; email: string }
  /** すでに許可されていた（固定のアドレス・先に追加済み）。申請だけ消した */
  | { status: 'already_allowed'; email: string }
  /** 申請が無い（別の管理者が先に許可・却下した） */
  | { status: 'not_found' }
  /** 許可リストが上限に達している。申請は残す */
  | { status: 'list_full'; email: string };

/**
 * 利用の申請を却下する（申請の行を消す。許可リストは変えない）。消した申請のアドレスを返し、無ければ null。
 *
 * 許可（approveGateAccessRequest）と同じロックで直列にする。ロックが無いと、許可が申請を読んだ直後に
 * 却下が行を消しても、許可はそのまま許可リストに足し、却下した管理者にも成功が返る（却下したのに許可される）
 */
export async function rejectGateAccessRequest(
  db: PrismaClient,
  requestId: string
): Promise<string | null> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GATE_ALLOWLIST_ADD_LOCK_KEY})`;
    const request = await tx.gateAccessRequest.findUnique({
      where: { id: requestId },
      select: { email: true },
    });
    if (!request) return null;
    await tx.gateAccessRequest.deleteMany({ where: { id: requestId } });
    return request.email;
  }, GATE_ALLOWLIST_TRANSACTION_OPTIONS);
}

/**
 * 利用の申請を許可する。許可リストへの追加と申請の削除を 1 つのトランザクションにし、
 * addGateAllowedEmail と同じロックで直列にする（件数の上限と、同じアドレスの二重の追加を防ぐ）
 */
export async function approveGateAccessRequest(
  db: PrismaClient,
  input: ApproveGateAccessRequestInput
): Promise<ApproveGateAccessRequestResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GATE_ALLOWLIST_ADD_LOCK_KEY})`;
    const request = await tx.gateAccessRequest.findUnique({
      where: { id: input.requestId },
      select: { email: true },
    });
    if (!request) return { status: 'not_found' };
    const { email } = request;

    const alreadyAllowed =
      input.fixedEmails.includes(email) ||
      (await tx.gateAllowedEmail.findUnique({
        where: { email },
        select: { id: true },
      })) !== null;
    if (!alreadyAllowed) {
      const count = await tx.gateAllowedEmail.count({
        where:
          input.fixedEmails.length > 0
            ? { email: { notIn: [...input.fixedEmails] } }
            : undefined,
      });
      if (count >= GATE_ALLOWLIST_MAX_ENTRIES) return { status: 'list_full', email };
      await tx.gateAllowedEmail.create({
        data: { email, createdById: input.approvedById },
        select: { id: true },
      });
    }
    await tx.gateAccessRequest.deleteMany({ where: { email } });
    return { status: alreadyAllowed ? 'already_allowed' : 'approved', email };
  }, GATE_ALLOWLIST_TRANSACTION_OPTIONS);
}
