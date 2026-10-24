import {
  type ExistingPreset,
  type MigrationApi,
  type MigrationOperation,
  type SavePresetResult,
} from '@/lib/favorites/legacy-favorite-sources';

async function listPresets(): Promise<ExistingPreset[]> {
  const res = await fetch('/api/user/source-presets');
  if (!res.ok) throw new Error(`Failed to fetch presets: ${res.status}`);
  const body = (await res.json()) as { presets?: ExistingPreset[] };
  return body.presets ?? [];
}

async function savePreset(
  operation: MigrationOperation
): Promise<SavePresetResult> {
  try {
    const res =
      operation.type === 'create'
        ? await fetch('/api/user/source-presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: operation.name,
              sourceIds: operation.sourceIds,
            }),
          })
        : await fetch(`/api/user/source-presets/${operation.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceIds: operation.sourceIds }),
          });
    if (res.ok) return 'saved';
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    // 入れるソースがどれも無効（削除・停止済み）なら、保存するものが無い
    if (body.error === 'No valid sources provided') return 'skipped';
    return 'failed';
  } catch {
    return 'failed';
  }
}

/** ブラウザから /api/user/source-presets を呼ぶ（旧お気に入りソースの移行用） */
export const legacyFavoriteMigrationApi: MigrationApi = {
  listPresets,
  savePreset,
};
