/**
 * ブラウザに残っている「お気に入りソース」を、カスタムプリセットに移す（Issue #709）
 *
 * お気に入りソースは localStorage にだけ保存していた（旧 /favorites/feed）。今はソースの組を
 * サーバーのカスタムプリセットに保存し、ホームのフィルターで使う。旧データは消さずに移すため、
 * 全部を保存できたときだけ localStorage を消す。途中で失敗したら残し、次に開いたときにやり直す。
 *
 * - 同じ名前のプリセットが既にあれば（別のブラウザから移した・前回の途中まで移した）、ソースを足す。
 *   名前が同じだけで「移行済み」とはみなさない（中身が違えば、このブラウザのソースが失われるため）
 * - プリセットの上限（1 人 10 件・1 件 100 ソース）に合わせる。全部のソースは「お気に入りソース」に入れ、
 *   100 を超える分は「お気に入りソース (2)」…に分ける。フォルダーごとのプリセットは空きがある分だけ作る
 *   （入らなかったフォルダーのソースも「お気に入りソース」には入っているので、ソースは失わない）
 */

export const LEGACY_FAVORITE_SOURCES_KEY = 'techtrend-favorite-sources';
export const LEGACY_FAVORITE_FOLDERS_KEY = 'techtrend-favorite-folders';

/** すべてのお気に入りソースを入れるプリセットの名前 */
export const FAVORITE_SOURCES_PRESET_NAME = 'お気に入りソース';

/** プリセットの上限（/api/user/source-presets の検証と同じ） */
export const MAX_PRESETS_PER_USER = 10;
export const MAX_SOURCES_PER_PRESET = 100;
const MAX_PRESET_NAME_LENGTH = 50;

interface LegacyFavoriteSource {
  sourceId: string;
  folder?: string;
  order?: number;
}

interface LegacyFavoriteFolder {
  id: string;
  name: string;
  order?: number;
}

export interface PresetToSave {
  name: string;
  sourceIds: string[];
}

export interface ExistingPreset {
  id: string;
  name: string;
  sourceIds: string[];
}

function parseArray<T>(raw: string | null, isItem: (v: unknown) => v is T) {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch {
    return [];
  }
}

function isLegacySource(value: unknown): value is LegacyFavoriteSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LegacyFavoriteSource).sourceId === 'string'
  );
}

function isLegacyFolder(value: unknown): value is LegacyFavoriteFolder {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LegacyFavoriteFolder).id === 'string' &&
    typeof (value as LegacyFavoriteFolder).name === 'string'
  );
}

const byOrder = (a: { order?: number }, b: { order?: number }) =>
  (a.order ?? 0) - (b.order ?? 0);

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * localStorage の旧データを読む。全部のソースを入れるプリセット（100 ソースごとに分ける）と、
 * ソースの入ったフォルダーごとのプリセット（「お気に入り: フォルダー名」）を返す。お気に入りが無ければ null
 */
export function readLegacyFavoriteSources(storage: Pick<Storage, 'getItem'>): {
  sourceIds: string[];
  mainPresets: PresetToSave[];
  folderPresets: PresetToSave[];
} | null {
  const sources = parseArray(
    storage.getItem(LEGACY_FAVORITE_SOURCES_KEY),
    isLegacySource
  ).sort(byOrder);
  const sourceIds = [...new Set(sources.map((s) => s.sourceId))];
  if (sourceIds.length === 0) return null;

  const mainPresets = chunk(sourceIds, MAX_SOURCES_PER_PRESET).map(
    (ids, index) => ({
      name:
        index === 0
          ? FAVORITE_SOURCES_PRESET_NAME
          : `${FAVORITE_SOURCES_PRESET_NAME} (${index + 1})`,
      sourceIds: ids,
    })
  );

  const folders = parseArray(
    storage.getItem(LEGACY_FAVORITE_FOLDERS_KEY),
    isLegacyFolder
  ).sort(byOrder);
  const folderPresets = folders.flatMap((folder) => {
    const ids = [
      ...new Set(
        sources.filter((s) => s.folder === folder.id).map((s) => s.sourceId)
      ),
    ].slice(0, MAX_SOURCES_PER_PRESET);
    if (ids.length === 0) return [];
    return [
      {
        name: `お気に入り: ${folder.name}`.slice(0, MAX_PRESET_NAME_LENGTH),
        sourceIds: ids,
      },
    ];
  });

  return { sourceIds, mainPresets, folderPresets };
}

export type MigrationOperation =
  | { type: 'create'; name: string; sourceIds: string[] }
  | { type: 'update'; id: string; sourceIds: string[] };

const normalizeName = (name: string) => name.trim().toLowerCase();

/**
 * 既存のプリセットに合わせて、作る・足すの操作を決める。
 * 全部のソースを入れるプリセットが上限で作れないときは 'limit'（旧データは残す）
 */
export function planLegacyFavoriteMigration(
  legacy: { mainPresets: PresetToSave[]; folderPresets: PresetToSave[] },
  existing: ExistingPreset[]
): { status: 'ok'; operations: MigrationOperation[] } | { status: 'limit' } {
  const byName = new Map(existing.map((p) => [normalizeName(p.name), p]));
  let freeSlots = MAX_PRESETS_PER_USER - existing.length;
  const operations: MigrationOperation[] = [];
  // この移行で作ることにした名前（まだサーバーに無いので、足す操作の宛先にできない）
  const planned = new Set<string>();

  // 使われていない名前（「名前 (2)」「名前 (3)」…）。50 文字に切っても重ならないよう、末尾を残して詰める
  const freeName = (base: string): string => {
    for (let i = 2; ; i += 1) {
      const suffix = ` (${i})`;
      const candidate = `${base.slice(0, MAX_PRESET_NAME_LENGTH - suffix.length)}${suffix}`;
      if (!byName.has(normalizeName(candidate))) return candidate;
    }
  };

  const create = (preset: PresetToSave, required: boolean): boolean => {
    if (freeSlots <= 0) return !required;
    freeSlots -= 1;
    byName.set(normalizeName(preset.name), {
      id: '',
      name: preset.name,
      sourceIds: preset.sourceIds,
    });
    planned.add(normalizeName(preset.name));
    operations.push({ type: 'create', ...preset });
    return true;
  };

  const plan = (preset: PresetToSave, required: boolean): boolean => {
    const current = byName.get(normalizeName(preset.name));
    if (!current) return create(preset, required);
    // 50 文字に切ったフォルダー名が重なったときなど。別の名前で作る
    if (planned.has(normalizeName(preset.name))) {
      return create({ ...preset, name: freeName(preset.name) }, required);
    }

    const added = preset.sourceIds.filter(
      (id) => !current.sourceIds.includes(id)
    );
    if (added.length === 0) return true; // 足すものが無い（前回までに移した）
    if (current.sourceIds.length + added.length <= MAX_SOURCES_PER_PRESET) {
      operations.push({
        type: 'update',
        id: current.id,
        sourceIds: [...current.sourceIds, ...added],
      });
      return true;
    }
    // 足すと上限を超える。足せないソースだけで、別の名前のプリセットを作る
    return create({ name: freeName(preset.name), sourceIds: added }, required);
  };

  for (const preset of legacy.mainPresets) {
    if (!plan(preset, true)) return { status: 'limit' };
  }
  // フォルダーごとのプリセットは空きがある分だけ（入らなくても、ソースは上で全部移している）
  for (const preset of legacy.folderPresets) {
    plan(preset, false);
  }
  return { status: 'ok', operations };
}

/**
 * プリセットを 1 つ保存した結果
 * - skipped: 入れるソースがどれも無効になっている。保存できないので飛ばす
 */
export type SavePresetResult = 'saved' | 'skipped' | 'failed';

export interface MigrationApi {
  listPresets: () => Promise<ExistingPreset[]>;
  savePreset: (operation: MigrationOperation) => Promise<SavePresetResult>;
}

/**
 * 旧データをプリセットに移す。全部を保存できたら localStorage を消す。
 * 保存できなければ消さずに 'failed' を返す（Storage が使えないときも同じ）
 */
export async function migrateLegacyFavoriteSources({
  storage,
  api,
}: {
  storage: Pick<Storage, 'getItem' | 'removeItem'>;
  api: MigrationApi;
}): Promise<
  | { status: 'none' }
  | { status: 'migrated'; sourceIds: string[] }
  | { status: 'failed'; reason: 'limit' | 'error' }
> {
  try {
    const legacy = readLegacyFavoriteSources(storage);
    if (!legacy) return { status: 'none' };

    const plan = planLegacyFavoriteMigration(legacy, await api.listPresets());
    if (plan.status === 'limit') return { status: 'failed', reason: 'limit' };

    for (const operation of plan.operations) {
      if ((await api.savePreset(operation)) === 'failed') {
        return { status: 'failed', reason: 'error' };
      }
    }

    storage.removeItem(LEGACY_FAVORITE_SOURCES_KEY);
    storage.removeItem(LEGACY_FAVORITE_FOLDERS_KEY);

    // 絞り込みに使うのは、プリセットに入ったソースだけ（削除・停止したソースはサーバーが落としている）
    const saved = new Set(
      (await api.listPresets()).flatMap((p) => p.sourceIds)
    );
    return {
      status: 'migrated',
      sourceIds: legacy.sourceIds.filter((id) => saved.has(id)),
    };
  } catch {
    return { status: 'failed', reason: 'error' };
  }
}
