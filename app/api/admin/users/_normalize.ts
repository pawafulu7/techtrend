export function normalizeRole(
  role: string | null | undefined
): 'admin' | 'user' {
  return role === 'admin' ? 'admin' : 'user';
}
