export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: 'admin' | 'user';
  image: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export const ROLE_LABELS: Record<AdminUser['role'], string> = {
  admin: '管理者',
  user: '一般ユーザー',
} as const;
