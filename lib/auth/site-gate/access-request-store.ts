/**
 * 利用の申請（GateAccessRequest）の保存と、拒否のページでの「申請済み」の確認
 *
 * 許可（許可リストへ足して申請を消す）・却下は allowlist-store.ts。保存も同じロックで直列にする。
 */
import type { PrismaClient } from '@/lib/prisma-exports';
import {
  GATE_ALLOWLIST_ADD_LOCK_KEY,
  GATE_ALLOWLIST_TRANSACTION_OPTIONS,
} from './allowlist-store';
import { GATE_REQUEST_MAX_PENDING } from './constants';

/** 管理画面の一覧に使う列 */
export const GATE_ACCESS_REQUEST_SELECT = {
  id: true,
  email: true,
  note: true,
  createdAt: true,
} as const;

export interface SaveGateAccessRequestInput {
  /** 正規化済みのアドレス（normalizeGateEmail） */
  email: string;
  /** 備考（前後の空白を除いたもの）。無ければ null */
  note: string | null;
  /** 設定で固定した許可アドレス（DB に行が無くても許可済み） */
  fixedEmails: readonly string[];
  /**
   * このアドレスで Google にログインした本人からの申請か（フォームのアドレスを書き換えていない）。
   * すでにある申請の備考を書き換えられるのは本人だけ（書き換えたアドレスは誰のものでも入れられるので、
   * 他人が先に届いている申請の備考を上書き・消去できないようにする）
   */
  ownAccount: boolean;
}

export type SaveGateAccessRequestResult =
  /**
   * 申請を置いた。同じアドレスの申請がすでにあれば、本人からなら備考を書き換え（送り直し・再読み込み）、
   * 本人以外からなら先に届いている申請をそのまま残す。書き換えたアドレスでは、許可済みでも申請を置く
   */
  | 'saved'
  /** 本人のアドレスが、すでに許可されている（拒否されたあとに管理者が追加した）。申請は置かない */
  | 'already_allowed'
  /** 対応待ちが上限に達していて、新しく置けない */
  | 'full';

/**
 * 申請を保存する。
 *
 * 許可済みかの確認・件数の確認・保存を 1 つのトランザクションにし、許可リストへの追加・申請の許可・却下と
 * 同じロックで直列にする。別々に流すと、本人が送り直した申請を「未許可」と確かめた直後に管理者が許可
 * （申請の削除）を終えたとき、許可済みのアカウントの申請が対応待ちに作り直される。許可済みかは、入口の
 * 照合のキャッシュ（外した直後の 30 秒は「許可」が残る）ではなく DB で確かめる
 */
export async function saveGateAccessRequest(
  db: PrismaClient,
  input: SaveGateAccessRequestInput
): Promise<SaveGateAccessRequestResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GATE_ALLOWLIST_ADD_LOCK_KEY})`;

    if (!input.ownAccount) {
      // 書き換えたアドレス。このアドレスの状態（許可済みか・申請済みか）で結果を変えない。
      // 件数を先に見て、満杯ならどのアドレスでも 'full'、そうでなければどのアドレスでも 'saved' にする
      // （許可済みかを見て申請を置かない作りにすると、満杯のときの応答や枠の減り方で、任意のアドレスが
      // 許可リストにあるかを調べられる）。許可済みのアドレスの申請が置かれても、管理者が許可を押せば
      // 「すでに許可されています」で消える（allowlist-store.ts の approveGateAccessRequest）
      const pending = await tx.gateAccessRequest.count();
      if (pending >= GATE_REQUEST_MAX_PENDING) return 'full';
      const existing = await tx.gateAccessRequest.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      // 先に届いている申請は変えない（本人以外に、備考を上書き・消去させない）
      if (existing === null) {
        await tx.gateAccessRequest.create({
          data: { email: input.email, note: input.note },
          select: { id: true },
        });
      }
      return 'saved';
    }

    const alreadyAllowed =
      input.fixedEmails.includes(input.email) ||
      (await tx.gateAllowedEmail.findUnique({
        where: { email: input.email },
        select: { id: true },
      })) !== null;
    if (alreadyAllowed) return 'already_allowed';

    const updated = await tx.gateAccessRequest.updateMany({
      where: { email: input.email },
      data: { note: input.note },
    });
    if (updated.count > 0) return 'saved';

    const pending = await tx.gateAccessRequest.count();
    if (pending >= GATE_REQUEST_MAX_PENDING) return 'full';

    await tx.gateAccessRequest.create({
      data: { email: input.email, note: input.note },
      select: { id: true },
    });
    return 'saved';
  }, GATE_ALLOWLIST_TRANSACTION_OPTIONS);
}

/** このアカウント（正規化済みのアドレス）の申請が届いているか */
export async function hasGateAccessRequest(
  db: PrismaClient,
  email: string
): Promise<boolean> {
  const row = await db.gateAccessRequest.findUnique({
    where: { email },
    select: { id: true },
  });
  return row !== null;
}
