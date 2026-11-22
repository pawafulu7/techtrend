/**
 * proxy.ts の入口の判定（evaluate.ts）に渡す依存。入口用の Better Auth と許可リストをつなぐ
 *
 * proxy からは、入口の Cookie があるときにだけ動的 import で読む（未ログインのアクセスでは Better Auth も
 * Prisma も読み込まない）。
 */
import { checkGateEmailAccess } from './allowlist';
import type { SiteGateSettings } from './config';
import type { SiteGateDeps } from './evaluate';
import { getGateAuth } from './gate-auth';

export function createSiteGateDeps(settings: SiteGateSettings): SiteGateDeps {
  const auth = getGateAuth(settings);
  return {
    async getSession(headers) {
      const { headers: responseHeaders, response } = await auth.api.getSession({
        headers,
        returnHeaders: true,
      });
      return {
        session: response
          ? {
              email: response.user.email,
              emailVerified: response.user.emailVerified,
              createdAt: new Date(response.session.createdAt),
            }
          : null,
        setCookies: responseHeaders.getSetCookie(),
      };
    },
    async signOut(headers) {
      const { headers: responseHeaders } = await auth.api.signOut({
        headers,
        returnHeaders: true,
      });
      return responseHeaders.getSetCookie();
    },
    checkAccess(email, sessionCreatedAt) {
      return checkGateEmailAccess(email, {
        fixedEmails: settings.fixedEmails,
        sessionCreatedAt,
      });
    },
  };
}
