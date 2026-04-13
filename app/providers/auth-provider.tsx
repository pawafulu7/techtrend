'use client';

// AuthProvider is a passthrough — Better Auth session is accessed directly
// via authClient.useSession() in client components. This component preserves
// the client boundary established by the original NextAuth SessionProvider.

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return <>{children}</>;
}
