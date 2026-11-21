/**
 * lib/config/env.ts の値から入口の設定を読む（Route Handler とキャッシュヘッダの判定が使う）
 *
 * proxy.ts は env.ts を使わず、生の process.env をリクエストごとに読んで同じ resolveSiteGateConfig に渡す。
 * Vercel では環境変数の変更に再デプロイが要るので、両者は一致する。
 */
import { env } from '@/lib/config/env';
import {
  isSiteGateEnabled,
  resolveSiteGateConfig,
  type SiteGateConfig,
  type SiteGateRawEnv,
} from './config';

function siteGateRawEnvFromEnv(): SiteGateRawEnv {
  return {
    GATE_GOOGLE_ENABLED: env.GATE_GOOGLE_ENABLED,
    GATE_GOOGLE_CLIENT_ID: env.GATE_GOOGLE_CLIENT_ID,
    GATE_GOOGLE_CLIENT_SECRET: env.GATE_GOOGLE_CLIENT_SECRET,
    GATE_AUTH_SECRET: env.GATE_AUTH_SECRET,
    GATE_ALWAYS_ALLOWED_EMAILS: env.GATE_ALWAYS_ALLOWED_EMAILS,
    BASIC_AUTH_ENABLED: env.BASIC_AUTH_ENABLED,
    VERCEL_ENV: env.VERCEL_ENV,
    AUTH_SECRET: env.AUTH_SECRET,
    NEXTAUTH_SECRET: env.NEXTAUTH_SECRET,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
    PORT: env.PORT,
    NODE_ENV: env.NODE_ENV,
  };
}

export function getSiteGateConfig(): SiteGateConfig {
  return resolveSiteGateConfig(siteGateRawEnvFromEnv());
}

/** 入口が有効になりうるか（不正な値・Basic の設定の残りも有効の側に倒す）。公開キャッシュを許すかの判定に使う */
export function isSiteGateEnabledFromEnv(): boolean {
  return isSiteGateEnabled(siteGateRawEnvFromEnv());
}
