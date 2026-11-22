import type { SiteGateConfig } from './config';
import { normalizeGateEmail } from './email';
import { getGateAuth } from './gate-auth';

/**
 * この要求の入口のログイン状態のアドレス（正規化済み）。入口が無効なとき・ログイン状態が無いときは null。
 * 確かめられないとき（Better Auth の例外）は投げる（呼び出し元は削除を断る側に倒す）
 */
export async function getCurrentGateEmail(
  config: SiteGateConfig,
  headers: Headers
): Promise<string | null> {
  if (config.kind !== 'enabled') return null;
  const session = await getGateAuth(config.settings).api.getSession({ headers });
  const email = session?.user?.email;
  return typeof email === 'string' ? normalizeGateEmail(email) : null;
}
