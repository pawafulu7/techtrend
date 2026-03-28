import { LoginContent } from './_components/login-content';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl = '/' } = await searchParams;
  return <LoginContent callbackUrl={callbackUrl} />;
}
