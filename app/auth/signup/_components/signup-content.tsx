'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { SignupForm } from '@/components/auth/SignupForm';
import { EmailSignupForm } from '@/components/auth/EmailSignupForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export function SignupContent() {
  const [isLoading, setIsLoading] = useState(false);

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setIsLoading(true);
    try {
      await signIn(provider, { callbackUrl: '/profile' });
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
          <CardTitle className="text-center text-2xl">新規登録</CardTitle>
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
              <span className="bg-background text-muted-foreground px-2">
                または
              </span>
            </div>
          </div>

          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">メールで登録</TabsTrigger>
              <TabsTrigger value="password">パスワードで登録</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="mt-4">
              <EmailSignupForm />
            </TabsContent>
            <TabsContent value="password" className="mt-4">
              <SignupForm />
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-muted-foreground text-center text-sm">
            既にアカウントをお持ちの方は{' '}
            <Link href="/auth/login" className="text-primary underline">
              ログイン
            </Link>
          </div>
          <div className="text-muted-foreground text-center text-xs">
            登録することで、利用規約とプライバシーポリシーに同意したものとみなされます
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
