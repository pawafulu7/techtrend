'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { SignupForm } from '@/components/auth/SignupForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Github } from 'lucide-react';
import { GoogleIcon } from '@/components/icons/google';

export default function SignupPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setIsLoading(true);
    try {
      await signIn(provider, { callbackUrl: '/profile' });
    } catch (error) {
      console.error('OAuth sign in error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-lg mx-auto py-10">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">新規登録</CardTitle>
          <CardDescription className="text-center">
            TechTrendアカウントを作成してください
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              onClick={() => handleOAuthSignIn('google')}
              disabled={isLoading}
            >
              <GoogleIcon className="mr-2 h-4 w-4" />
              Google
            </Button>
            <Button
              variant="outline"
              onClick={() => handleOAuthSignIn('github')}
              disabled={isLoading}
            >
              <Github className="mr-2 h-4 w-4" />
              GitHub
            </Button>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                または
              </span>
            </div>
          </div>

          <SignupForm />
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-muted-foreground text-center">
            既にアカウントをお持ちの方は{' '}
            <Link href="/auth/login" className="text-primary underline">
              ログイン
            </Link>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            登録することで、利用規約とプライバシーポリシーに同意したものとみなされます
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}