import { getSession } from '@/lib/auth/get-session';
import { InquiriesPageContent } from './_components/inquiries-page-content';

export default async function InquiriesPage() {
  // 管理者であることは app/admin/layout.tsx の requireAdmin() が確かめている。
  // 誰が開いたかを渡し、別のアカウントに切り替わったら画面のデータを出さないようにする
  const session = await getSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 tracking-tight">問い合わせ</h1>
        <p className="text-muted-foreground">
          利用者から届いた要望・不具合の報告を確認し、対応状況を管理します。
        </p>
      </div>
      <InquiriesPageContent viewerId={session?.user.id ?? null} />
    </div>
  );
}
