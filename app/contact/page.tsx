import type { Metadata } from 'next';
import { Mail } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { getSession } from '@/lib/auth/get-session';
import { ContactPageContent } from './_components/contact-page-content';

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: '機能の要望・不具合の報告・質問を受け付けています。',
};

export default async function ContactPage() {
  // ログイン中かどうかを描画の前に決め、返信先の欄が hydration の後に出入りしないようにする
  const session = await getSession();
  const user = session?.user;
  const signedInEmail = user && !user.deletedAt ? user.email : null;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <PageHeader
        icon={Mail}
        title="お問い合わせ"
        description="機能の要望・不具合の報告・質問を受け付けています。"
      />
      <ContactPageContent signedInEmail={signedInEmail} />
    </div>
  );
}
