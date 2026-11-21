'use client';

import { ErrorState } from '@/components/ui-v2/error-state';
import { Button } from '@/components/ui-v2/button-v2';

/**
 * サイトの入口（Google ログイン）のログイン状態が切れた・取り消されたときの表示。
 * アプリ内のログイン切れ（「ログインの有効期限が切れました」）と同じ部品と並べ方にする。
 * ページを開き直すと、proxy が Google のログインへ移す（取り消されていれば拒否のページになる）
 */
export function SiteGateReopenState() {
  return (
    <ErrorState
      size="block"
      title="サイトに入り直す必要があります"
      description="ページを開き直すと、Google のログインから入り直せます。"
    >
      <Button className="mt-6 min-h-[44px]" onClick={() => window.location.reload()}>
        ページを開き直す
      </Button>
    </ErrorState>
  );
}
