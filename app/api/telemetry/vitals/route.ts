/**
 * Web Vitals API Route Handler
 *
 * Entry point for /api/telemetry/vitals. Delegates to handlers/.
 *
 * POST - 閲覧者の 5% から届く計測を受けて、集計用のバッファに入れる
 * GET  - page ごとの集計を返す（管理者だけ）
 */
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { handleGet, handlePost } from './handlers';

// 計測はログインしていない閲覧者からも届くので、認証は付けずに IP 単位で制限する。
// セッションは使わないので引かない（引くとログイン中の閲覧者ごとに認証の DB を引く）
export const POST = withRateLimit('write:telemetry-vitals', handlePost, {
  resolveSession: false,
});
export const GET = withAdminAuth(withRateLimit('admin:read', handleGet));
