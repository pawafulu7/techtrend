/**
 * 収集のジョブ（collect-feeds.ts）を失敗として終わらせる条件。ワークフローの失敗の
 * Slack 通知に乗せ、人が気づけるようにする。
 *
 * - 指定した名前・id のうち、DB に行が無いもの。今までは0件で黙って素通りし、実装済みの
 *   ソース（DeepMind Blog など）が何か月も収集されていなかった。行はあるが enabled=false の
 *   ものは意図した停止なので含めない
 * - ソースの形式が変わり、記事を取り出せないもの（SourceFormatError）
 *
 * ネットワークの失敗など一時的なものは含めない（毎回の失敗の通知にしないため）。
 */
import { SourceFormatError } from '@/lib/fetchers/errors';

export interface RequestedSourceRow {
  id: string;
  name: string;
  enabled: boolean;
}

/** 指定した名前・id を、DB に行が無いもの（missing）と、行はあるが無効のもの（disabled）に分ける */
export function findUnregisteredSources(
  requested: readonly string[],
  rows: readonly RequestedSourceRow[]
): { missing: string[]; disabled: string[] } {
  const missing: string[] = [];
  const disabled: string[] = [];
  for (const key of new Set(requested)) {
    const row = rows.find((r) => r.id === key || r.name === key);
    if (!row) {
      missing.push(key);
    } else if (!row.enabled) {
      disabled.push(key);
    }
  }
  return { missing, disabled };
}

export function countSourceFormatErrors(errors: readonly Error[]): number {
  return errors.filter((error) => error instanceof SourceFormatError).length;
}

/** ジョブを失敗にする理由の一覧。空ならジョブは成功 */
export function describeCollectFailures(
  missingSources: readonly string[],
  formatErrorSources: readonly string[]
): string[] {
  const messages: string[] = [];
  if (missingSources.length > 0) {
    messages.push(
      `DB に行が無いソース（登録スクリプトを流すか、ワークフローから名前を外す）: ${missingSources.join(', ')}`
    );
  }
  if (formatErrorSources.length > 0) {
    messages.push(
      `記事を取り出せなかったソース（ソースの HTML の形が変わった可能性）: ${formatErrorSources.join(', ')}`
    );
  }
  return messages;
}
