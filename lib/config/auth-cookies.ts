import { env } from '@/lib/config/env';

// Better Auth v1.6.2 のデフォルトCookie名
// cookie prefix: "better-auth"（変更は advanced.cookiePrefix で可能）
// secure prefix: "__Secure-"（production or advanced.useSecureCookies=true 時）
const isProduction = env.NODE_ENV === 'production';
const cookiePrefix = isProduction ? '__Secure-' : '';

export const AUTH_COOKIES = {
  sessionToken: `${cookiePrefix}better-auth.session_token`,
  sessionData: `${cookiePrefix}better-auth.session_data`,
} as const;
