import { sanitizeCallbackUrl } from '@/lib/routes/auth';
import { LoginContent } from './_components/login-content';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl: rawCallbackUrl } = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(rawCallbackUrl);
  return <LoginContent callbackUrl={callbackUrl} />;
}
