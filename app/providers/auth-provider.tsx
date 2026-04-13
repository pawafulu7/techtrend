// 'use client' is intentionally omitted: AuthProvider is a server-safe passthrough.
// Better Auth session context (authClient) is accessed directly in client components
// via authClient.useSession(), so no React context wrapper is needed here.
// Reserved for future Better Auth context if shared client-side state is required.

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return <>{children}</>;
}
