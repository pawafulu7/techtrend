/**
 * 入口用の Better Auth のインスタンス（DB なし）
 *
 * 設定は gate-auth-options.ts。ここでは許可リストの照合（allowlist.ts）と pino のログをつなぐ。
 * インスタンスは設定ごとに 1 つ作って使い回す（proxy は process.env をリクエストごとに読むので、
 * 値が変わらなければ同じインスタンスになる）。設定が足りないときは呼び出し元がここへ来ない
 * （resolveSiteGateConfig が enabled のときだけ settings がある）ので、モジュールの読み込みでは例外にしない。
 */
import { betterAuth } from 'better-auth';
import logger from '@/lib/logger';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { checkGateEmailAccess } from './allowlist';
import type { SiteGateSettings } from './config';
import {
  createGateAuthOptions,
  createValidateGateUserInfo,
  toGateAuthLogger,
} from './gate-auth-options';
import { noteRejectedGateAccount } from './rejected-account-context';

function buildGateAuth(settings: SiteGateSettings) {
  return betterAuth(
    createGateAuthOptions(settings, {
      validateUserInfo: createValidateGateUserInfo({
        checkAccess: (email) =>
          checkGateEmailAccess(email, { fixedEmails: settings.fixedEmails }),
        onRejected: (reason, maskedEmail) => {
          logger.info(
            { reason, email: maskedEmail },
            '[site-gate] ログインを拒否しました'
          );
        },
        onUnavailable: (error) => {
          logger.error(
            { errorSummary: summarizeError(error) },
            '[site-gate] ログイン時に許可リストを照合できませんでした'
          );
        },
        // 戻りの Route Handler（app/api/gate/[...all]/route.ts）が、利用の申請用の Cookie に載せる
        onNotListed: noteRejectedGateAccount,
      }),
      logger: toGateAuthLogger((level, message) => {
        logger[level]({ source: 'better-auth:site-gate' }, message);
      }),
    })
  );
}

export type GateAuth = ReturnType<typeof buildGateAuth>;

let cached: { key: string; auth: GateAuth } | null = null;

export function getGateAuth(settings: SiteGateSettings): GateAuth {
  const key = JSON.stringify(settings);
  if (cached?.key !== key) {
    cached = { key, auth: buildGateAuth(settings) };
  }
  return cached.auth;
}
