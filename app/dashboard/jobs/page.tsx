import { requireAdmin } from '@/lib/auth/admin-check';
import JobManagementDashboard from './components/JobManagementDashboard';

/**
 * Job Management Dashboard Page (Admin Only)
 * Server Component for authentication check
 */
export default async function JobManagementPage() {
  // Admin authorization check (auto-redirect if unauthorized)
  await requireAdmin();

  // Render client component only if authorized
  return <JobManagementDashboard />;
}
