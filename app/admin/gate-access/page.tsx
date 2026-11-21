import { getSession } from '@/lib/auth/get-session';
import { GATE_ALLOW_CACHE_TTL_SEC } from '@/lib/auth/site-gate/constants';
import { GateAccessContent } from './_components/gate-access-content';

export default async function GateAccessPage() {
  // 管理者であることは app/admin/layout.tsx の requireAdmin() が確かめている。
  // 誰が開いたかを渡し、別のアカウントに切り替わったら画面のデータを出さないようにする
  const session = await getSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 tracking-tight">サイトに入れるアカウント</h1>
        <p className="text-muted-foreground">
          {`ここにある Gmail アドレスの Google アカウントだけが、サイトに入れます。削除すると、${GATE_ALLOW_CACHE_TTL_SEC} 秒ほどで入れなくなります。`}
        </p>
      </div>
      <GateAccessContent viewerId={session?.user.id ?? null} />
    </div>
  );
}
