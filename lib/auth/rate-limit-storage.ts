import type { BetterAuthOptions } from 'better-auth';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';
import {
  createRateLimiter,
  isRateLimitRejection,
} from '@/lib/middleware/rate-limiter';
import logger from '@/lib/logger';

type RateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions['rateLimit']>['customStorage']
>;
type RateLimitRule = Parameters<RateLimitStorage['consume']>[1];

/**
 * Better Auth のレート制限（ログイン・登録・確認メールの再送など）の回数を Redis に置く
 *
 * 保存先を指定しないと Better Auth はプロセスのメモリで数える。Vercel では複数のインスタンスが
 * 並んで動くので、インスタンスが変わると回数が 0 に戻り、ログインの総当たりや確認メールの連続送信を
 * 止められない。ここでは、アプリの API のレート制限と同じ仕組み（rate-limiter-flexible。本番は Redis、
 * テストと Redis の無い開発環境はメモリ）で数える。
 *
 * Redis が使えないときは通す（fail-open）。ログインはパスワードの確認が続き、サイト全体は
 * 入口（Google ログインと許可リスト。lib/auth/site-gate/）の後ろにあるので、ログインごと止めるより安全。
 *
 * 数え方は最初のリクエストからの固定の窓になる。既定のメモリは「最後に通したリクエストから」数えるので、
 * 窓の境目をまたぐと最大で 2 倍まで通る。Better Auth 自身が Redis（secondaryStorage）で数えるときも
 * 同じ固定の窓（INCR と期限）なので、それに合わせている。secondaryStorage を使わないのは、
 * セッションまで Redis に移り、パスワード変更時の Prisma でのセッション失効が効かなくなるため
 * （lib/auth/__tests__/auth-config.test.ts）。
 */

/** 規則（回数と秒数）ごとにリミッターを 1 つ作って使い回す */
const limiters = new Map<string, RateLimiterAbstract>();

function limiterFor(rule: RateLimitRule): RateLimiterAbstract {
  const id = `${rule.max}:${rule.window}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = createRateLimiter(
      rule.max,
      rule.window,
      `ratelimit:better-auth:${id}`
    );
    limiters.set(id, limiter);
  }
  return limiter;
}

export const betterAuthRateLimitStorage: RateLimitStorage = {
  async consume(key, rule) {
    try {
      await limiterFor(rule).consume(key, 1);
      return { allowed: true, retryAfter: null };
    } catch (rejection: unknown) {
      if (isRateLimitRejection(rejection)) {
        return {
          allowed: false,
          retryAfter: Math.max(1, Math.ceil(rejection.msBeforeNext / 1000)),
        };
      }

      logger.warn(
        {
          errorMessage:
            rejection instanceof Error ? rejection.message : 'Unknown error',
        },
        'Better Auth のレート制限の回数を確かめられないため、数えずに通します'
      );
      return { allowed: true, retryAfter: null };
    }
  },
};
