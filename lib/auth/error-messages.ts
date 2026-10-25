/**
 * Better Auth のクライアントが返すエラーを、画面に出す文言にする。
 * Better Auth の message は英語なので、そのまま画面に出さない。
 */
type AuthClientError = {
  code?: string;
  status?: number;
};

const TOO_MANY_REQUESTS_MESSAGE =
  'リクエストが多すぎます。しばらくしてからもう一度お試しください。';

export function getSignInErrorMessage(error: AuthClientError): string {
  if (error.status === 429) return TOO_MANY_REQUESTS_MESSAGE;
  return 'メールアドレスまたはパスワードが正しくありません';
}

export function getSignUpErrorMessage(error: AuthClientError): string {
  if (error.status === 429) return TOO_MANY_REQUESTS_MESSAGE;
  switch (error.code) {
    case 'INVALID_EMAIL':
      return '有効なメールアドレスを入力してください';
    case 'PASSWORD_TOO_SHORT':
      return 'パスワードは8文字以上で入力してください';
    case 'PASSWORD_TOO_LONG':
      return 'パスワードは128文字以内で入力してください';
    default:
      return 'アカウントを作成できませんでした。しばらくしてからもう一度お試しください。';
  }
}
