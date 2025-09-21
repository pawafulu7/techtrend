import { requireAdmin } from '@/lib/auth/admin-check';
import PerformanceDashboard from './PerformanceDashboard';

/**
 * パフォーマンスダッシュボードページ（管理者専用）
 * サーバーコンポーネントで権限チェックを行う
 */
export default async function PerformanceDashboardPage() {
  // 管理者権限チェック（権限がない場合は自動的にリダイレクト）
  await requireAdmin();

  // 権限がある場合のみクライアントコンポーネントをレンダリング
  return <PerformanceDashboard />;
}