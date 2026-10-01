/**
 * withRateLimit のキーの型テスト（issue #663）
 *
 * このファイルはどこからも import せず、型チェック（tsc / next build）でだけ使う。
 * __tests__/ は tsconfig の対象外なので、型の回帰を検知するためにここへ置く。
 *
 * RateLimitPolicyKey が string に戻ると、下の @ts-expect-error が不要になり、
 * 「未使用の @ts-expect-error」として型チェックが失敗する。
 */
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { createRateLimiterFromConfig } from '@/lib/rate-limiter';

const handler = () => new Response(null);

export function rateLimitPolicyKeyTypeTest(): void {
  // 定義済みのキーは通る
  withRateLimit('read:changelog', handler);

  // @ts-expect-error 未定義のキーは型エラーになる
  withRateLimit('read:nonexistent', handler);

  // @ts-expect-error リミッターの直接生成でも未定義のキーは型エラーになる
  createRateLimiterFromConfig('read:nonexistent');
}
