import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle } from 'lucide-react';

// 登録フォームの送信後に出す表示。メールアドレスの確認が済むまでログインできない（lib/auth/auth.ts）
export function SignupEmailSent() {
  return (
    <div className="space-y-4">
      <Alert className="border-[var(--tt-color-positive-border)] bg-[var(--tt-color-positive-bg)]">
        <CheckCircle className="h-4 w-4 text-[var(--tt-color-positive)]" />
        <AlertDescription className="text-[var(--tt-color-text)]">
          確認メールを送信しました！
        </AlertDescription>
      </Alert>
      <div className="rounded-lg bg-[var(--tt-color-surface-muted)] p-4">
        <p className="text-sm text-[var(--tt-color-text-muted)]">
          入力されたメールアドレスに認証リンクを送信しました。
          メールをご確認いただき、リンクをクリックして登録を完了してください。
        </p>
        <ul className="mt-3 space-y-1 text-xs text-[var(--tt-color-text-muted)]">
          <li>• メールが届かない場合は、迷惑メールフォルダをご確認ください</li>
          <li>• リンクの有効期限は24時間です</li>
          {/* 登録済みのメールアドレスで登録し直してもメールは届かない（Better Auth はアカウントの有無を明かさない） */}
          <li>
            •
            届かないときは、ログイン画面でメールアドレスとパスワードを入力すると再送信できます
          </li>
        </ul>
      </div>
    </div>
  );
}
