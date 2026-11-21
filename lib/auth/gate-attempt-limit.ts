import {
  createRateLimiterFromConfig,
  isRateLimitRejection,
} from '@/lib/middleware/rate-limiter';
import { clientIPFromHeaders } from '@/lib/middleware/rate-limit-ip';
import { logger } from '@/lib/logger';

/**
 * Basic 認証ゲートの総当たり対策（失敗した試行を IP ごとに数える）
 *
 * ゲートはインターネットからそのまま届く唯一の入口で、パスワード 1 つで守っている。
 * 失敗を数えないと、Basic のパスワードをいくらでも試せる。
 *
 * - 数えるのは、資格情報を送ってきて通らなかったリクエストだけ（ポリシーは `auth:gate`）
 * - 上限を超えた IP は、解除まで正しい資格情報でも通さない。締め出し中に当たりを確かめられないようにするため
 * - Redis が使えないときは通す（fail-open）。資格情報の確認は続くので、サイト全体を止めるより安全
 *
 * 呼び出すのは proxy.ts だけで、署名付き Cookie で通るリクエスト（ほぼすべての閲覧）では呼ばない。
 */

const POLICY = 'auth:gate';

export type GateAttemptOutcome = 'success' | 'failure';

function toRetryAfterSeconds(msBeforeNext: number): number {
  return Math.max(1, Math.ceil(msBeforeNext / 1000));
}

/**
 * ゲートの試行を記録し、締め出すなら解除までの秒数を返す（締め出さないなら null）
 *
 * @param headers リクエストのヘッダー（IP は x-forwarded-for の先頭。clientIPFromHeaders）
 * @param outcome 資格情報が通ったか
 */
export async function checkGateAttempt(
  headers: Headers,
  outcome: GateAttemptOutcome
): Promise<number | null> {
  const key = `ip:${clientIPFromHeaders(headers)}`;
  const limiter = createRateLimiterFromConfig(POLICY);

  try {
    if (outcome === 'success') {
      // 数えずに、締め出し中かだけを見る
      const current = await limiter.get(key);
      return current && current.consumedPoints > limiter.points
        ? toRetryAfterSeconds(current.msBeforeNext)
        : null;
    }

    await limiter.consume(key, 1);
    return null;
  } catch (rejection: unknown) {
    if (isRateLimitRejection(rejection)) {
      // 上限を超えた（締め出し中を含む）。ログは締め出しの始まりにだけ出す
      if (rejection.consumedPoints === limiter.points + 1) {
        logger.warn(
          { policy: POLICY },
          'Basic 認証ゲートの失敗が上限を超えたため、この IP を一時的に締め出しました'
        );
      }
      return toRetryAfterSeconds(rejection.msBeforeNext);
    }

    logger.warn(
      {
        policy: POLICY,
        errorMessage:
          rejection instanceof Error ? rejection.message : 'Unknown error',
      },
      'Basic 認証ゲートの試行回数を確かめられないため、数えずに通します'
    );
    return null;
  }
}
