/**
 * Google からの戻りの処理のなかで「未登録」と拒否したアカウントを、応答を組み立てる Route Handler へ渡す
 *
 * 拒否の判定はログイン時の確認（gate-auth-options.ts の validateUserInfo）で行われ、そこからは応答に
 * Cookie を載せられない。入口用の Better Auth のインスタンスは使い回す（gate-auth.ts）ので、要求ごとの値は
 * AsyncLocalStorage で持つ（同じ要求の非同期処理のなかだけで見える。ほかの要求と混ざらない）。
 */
import { AsyncLocalStorage } from 'node:async_hooks';

interface RejectedAccountStore {
  email: string | null;
}

const storage = new AsyncLocalStorage<RejectedAccountStore>();

/** run のなかで未登録と拒否されたアカウント（Google が返したアドレス）を、結果と一緒に返す */
export async function captureRejectedGateAccount<T>(
  run: () => Promise<T>
): Promise<{ result: T; email: string | null }> {
  const store: RejectedAccountStore = { email: null };
  const result = await storage.run(store, run);
  return { result, email: store.email };
}

/** 未登録と拒否したアカウントを控える。captureRejectedGateAccount の外（proxy など）では何もしない */
export function noteRejectedGateAccount(email: string): void {
  const store = storage.getStore();
  if (store) store.email = email;
}
