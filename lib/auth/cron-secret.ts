/**
 * cron 認証に使うシークレットの正規化・検証・選択を 1 箇所に集約する。
 *
 * CRON_TOKEN は新名称、CRON_SECRET は旧名称であり「両方が同時に有効な独立した
 * 資格情報」ではない（リネーム移行のフォールバック）。CRON_TOKEN が設定されていれば
 * CRON_SECRET は参照しない。
 *
 * 受理規則は lib/config/env.ts の bearerSecret スキーマおよび
 * lib/auth/authorization-header.ts のトークン抽出規則と一致させる。
 */
const VISIBLE_ASCII_PATTERN = /^[!-~]+$/;

function normalize(value: string | undefined): string | undefined {
  // lib/config/env.ts の sanitizeEnv() と同じ規則。空白のみは未設定として扱う
  return value !== undefined && value.trim() === '' ? undefined : value;
}

/**
 * CRON_TOKEN を優先し、未設定なら CRON_SECRET へフォールバックして選択する。
 *
 * 選択された値が Authorization ヘッダとして送出できない文字を含む場合は
 * undefined を返す（fail-closed）。**フォールバックはしない**:
 * CRON_TOKEN に不正な値が設定されている状態で旧 CRON_SECRET へ暗黙に
 * 戻ると、ローテーション失敗に気づけないため。
 *
 * CodeRabbit の提案（PR #649, proxy.ts:41）は不正な非空値で throw する実装を
 * 求めているが、ここでは throw せず undefined を返す。この関数は
 * proxy.ts の readGateEnv() からも呼ばれ、throw すると全リクエストが
 * middleware レベルの未捕捉例外になり、proxy.ts が持つ
 * 「設定不備 → 503」という制御された経路（gate.kind === 'misconfigured'
 * の分岐）を迂回してしまう。
 * 起動時の大きな失敗検知は lib/config/env.ts の zod
 * スキーマ（bearerSecret）が既に担っているため、この関数は認証層での
 * fail-closed（401）に徹する。
 *
 * また、選択されなかった側（legacy が選ばれた場合の token、または
 * その逆）の値は検証しない。未使用の値が不正でも認証を止める必要はなく、
 * 起動時の zod スキーマが別途検出する。
 */
export function resolveCronSecret(
  token: string | undefined,
  legacy: string | undefined
): string | undefined {
  const selected = normalize(token) ?? normalize(legacy);
  if (selected === undefined) return undefined;
  return VISIBLE_ASCII_PATTERN.test(selected) ? selected : undefined;
}
