export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: 'admin' | 'user';
  image: string | null;
  createdAt: string;
  deletedAt: string | null;
}
