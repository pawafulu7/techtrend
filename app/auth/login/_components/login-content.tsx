'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/auth-client';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/LoginForm';
import { Button } from '@/components/ui-v2/button-v2';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { Separator } from '@/components/ui/separator';
import { Github } from 'lucide-react';
import { GoogleIcon } from '@/components/icons/google';

interface LoginContentProps {
  callbackUrl: string;
}

export function LoginContent({ callbackUrl }: LoginContentProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setIsLoading(true);
    try {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: callbackUrl,
      });
      if (error) {
        console.error('OAuth sign-in failed:', error);
        return;
      }
    } catch (error) {
      console.error('OAuth sign-in failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-lg py-10">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-center text-2xl">ログイン</CardTitle>
          <CardDescription className="text-center">
            アカウントにログインしてTechTrendをご利用ください
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
              <span className="bg-background text-muted-foreground px-2">
                または
              </span>
            </div>
          </div>

          <LoginForm callbackUrl={callbackUrl} />
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-muted-foreground text-center text-sm">
            アカウントをお持ちでない方は{' '}
            <Link href="/auth/signup" className="text-primary underline">
              新規登録
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
