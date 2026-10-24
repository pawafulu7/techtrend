/**
 * ブラウザに残っているお気に入りソースを、カスタムプリセットに移す（Issue #709）
 */

import {
  FAVORITE_SOURCES_PRESET_NAME,
  LEGACY_FAVORITE_FOLDERS_KEY,
  LEGACY_FAVORITE_SOURCES_KEY,
  migrateLegacyFavoriteSources,
  planLegacyFavoriteMigration,
  readLegacyFavoriteSources,
  type ExistingPreset,
  type MigrationOperation,
  type SavePresetResult,
} from '@/lib/favorites/legacy-favorite-sources';

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    has: (key: string) => data.has(key),
  };
}

const sources = JSON.stringify([
  { id: 'f2', sourceId: 'src-b', order: 1, folder: 'folder-1' },
  { id: 'f1', sourceId: 'src-a', order: 0 },
  { id: 'f3', sourceId: 'src-c', order: 2, folder: 'folder-1' },
]);
const folders = JSON.stringify([
  { id: 'folder-1', name: '読む', color: '#000', order: 0 },
  { id: 'folder-empty', name: '空', color: '#000', order: 1 },
]);

const ids = (n: number, prefix = 'src') =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

const preset = (
  id: string,
  name: string,
  sourceIds: string[]
): ExistingPreset => ({ id, name, sourceIds });

describe('readLegacyFavoriteSources', () => {
  it('全部のソースを並び順で「お気に入りソース」にし、ソースの入ったフォルダーごとにもプリセットを作る', () => {
    const storage = memoryStorage({
      [LEGACY_FAVORITE_SOURCES_KEY]: sources,
      [LEGACY_FAVORITE_FOLDERS_KEY]: folders,
    });

    expect(readLegacyFavoriteSources(storage)).toEqual({
      sourceIds: ['src-a', 'src-b', 'src-c'],
      mainPresets: [
        {
          name: FAVORITE_SOURCES_PRESET_NAME,
          sourceIds: ['src-a', 'src-b', 'src-c'],
        },
      ],
      folderPresets: [
        { name: 'お気に入り: 読む', sourceIds: ['src-b', 'src-c'] },
      ],
    });
  });

  it('100 ソースを超えたら「お気に入りソース (2)」に分ける', () => {
    const storage = memoryStorage({
      [LEGACY_FAVORITE_SOURCES_KEY]: JSON.stringify(
        ids(150).map((sourceId, order) => ({ sourceId, order }))
      ),
    });

    const legacy = readLegacyFavoriteSources(storage)!;
    expect(legacy.mainPresets.map((p) => [p.name, p.sourceIds.length])).toEqual(
      [
        ['お気に入りソース', 100],
        ['お気に入りソース (2)', 50],
      ]
    );
  });

  it('お気に入りが無い・壊れているときは null', () => {
    expect(readLegacyFavoriteSources(memoryStorage({}))).toBeNull();
    expect(
      readLegacyFavoriteSources(
        memoryStorage({ [LEGACY_FAVORITE_SOURCES_KEY]: '{not json' })
      )
    ).toBeNull();
    expect(
      readLegacyFavoriteSources(
        memoryStorage({ [LEGACY_FAVORITE_SOURCES_KEY]: '[]' })
      )
    ).toBeNull();
  });
});

describe('planLegacyFavoriteMigration', () => {
  const legacy = {
    mainPresets: [
      { name: FAVORITE_SOURCES_PRESET_NAME, sourceIds: ['src-a', 'src-b'] },
    ],
    folderPresets: [{ name: 'お気に入り: 読む', sourceIds: ['src-b'] }],
  };

  it('同じ名前のプリセットが無ければ作る', () => {
    expect(planLegacyFavoriteMigration(legacy, [])).toEqual({
      status: 'ok',
      operations: [
        {
          type: 'create',
          name: FAVORITE_SOURCES_PRESET_NAME,
          sourceIds: ['src-a', 'src-b'],
        },
        { type: 'create', name: 'お気に入り: 読む', sourceIds: ['src-b'] },
      ],
    });
  });

  it('同じ名前のプリセットがあれば、名前だけで移行済みとはみなさず、足りないソースを足す（別のブラウザから移したとき）', () => {
    const plan = planLegacyFavoriteMigration(legacy, [
      preset('p1', 'お気に入りソース', ['src-x']),
    ]);

    expect(plan).toEqual({
      status: 'ok',
      operations: [
        { type: 'update', id: 'p1', sourceIds: ['src-x', 'src-a', 'src-b'] },
        { type: 'create', name: 'お気に入り: 読む', sourceIds: ['src-b'] },
      ],
    });
  });

  it('前回の途中まで移したプリセットは、足すものが無ければ何もしない（上限に数えずにやり直せる）', () => {
    const existing = [
      ...ids(9).map((id, i) => preset(id, `既存 ${i}`, ['src-z'])),
      preset('p-main', 'お気に入りソース', ['src-a', 'src-b']),
    ];

    expect(planLegacyFavoriteMigration(legacy, existing)).toEqual({
      status: 'ok',
      operations: [],
    });
  });

  it('足すと 100 を超えるときは、足せないソースを別の名前のプリセットにする', () => {
    const plan = planLegacyFavoriteMigration(legacy, [
      preset('p1', 'お気に入りソース', ids(99, 'old')),
    ]);

    expect(plan).toEqual({
      status: 'ok',
      operations: [
        {
          type: 'create',
          name: 'お気に入りソース (2)',
          sourceIds: ['src-a', 'src-b'],
        },
        { type: 'create', name: 'お気に入り: 読む', sourceIds: ['src-b'] },
      ],
    });
  });

  it('全部のソースを入れるプリセットを作る空きが無ければ limit', () => {
    const existing = ids(10).map((id, i) => preset(id, `既存 ${i}`, ['src-z']));

    expect(planLegacyFavoriteMigration(legacy, existing)).toEqual({
      status: 'limit',
    });
  });

  it('フォルダーごとのプリセットは空きがある分だけ作る（ソースは「お気に入りソース」に全部入る）', () => {
    const existing = ids(9).map((id, i) => preset(id, `既存 ${i}`, ['src-z']));

    expect(planLegacyFavoriteMigration(legacy, existing)).toEqual({
      status: 'ok',
      operations: [
        {
          type: 'create',
          name: FAVORITE_SOURCES_PRESET_NAME,
          sourceIds: ['src-a', 'src-b'],
        },
      ],
    });
  });

  it('50 文字に切ったフォルダー名が重なったら、別の名前で作る', () => {
    const long = 'あ'.repeat(60);
    const plan = planLegacyFavoriteMigration(
      {
        mainPresets: [
          { name: FAVORITE_SOURCES_PRESET_NAME, sourceIds: ['src-a'] },
        ],
        folderPresets: [
          { name: `お気に入り: ${long}`.slice(0, 50), sourceIds: ['src-a'] },
          { name: `お気に入り: ${long}`.slice(0, 50), sourceIds: ['src-b'] },
        ],
      },
      []
    );

    expect(plan.status).toBe('ok');
    const names =
      plan.status === 'ok'
        ? plan.operations.map((o) => (o.type === 'create' ? o.name : o.id))
        : [];
    expect(new Set(names).size).toBe(3);
    expect(names.every((n) => n.length <= 50)).toBe(true);
  });
});

describe('migrateLegacyFavoriteSources', () => {
  const storageWithData = () =>
    memoryStorage({
      [LEGACY_FAVORITE_SOURCES_KEY]: sources,
      [LEGACY_FAVORITE_FOLDERS_KEY]: folders,
    });

  // 保存した内容を覚え、後の一覧に返す（移行後に、プリセットに入ったソースで絞り込むため）
  const api = (
    existing: ExistingPreset[],
    results: SavePresetResult[] = []
  ) => {
    const presets = [...existing];
    return {
      listPresets: jest.fn(async () => presets.map((p) => ({ ...p }))),
      savePreset: jest.fn(async (op: MigrationOperation) => {
        const result = results.shift() ?? 'saved';
        if (result === 'saved') {
          if (op.type === 'create') {
            presets.push(
              preset(`new-${presets.length}`, op.name, op.sourceIds)
            );
          } else {
            const target = presets.find((p) => p.id === op.id)!;
            target.sourceIds = op.sourceIds;
          }
        }
        return result;
      }),
    };
  };

  it('全部保存できたら localStorage を消し、ホームで絞るソースを返す', async () => {
    const storage = storageWithData();
    const migrationApi = api([]);

    await expect(
      migrateLegacyFavoriteSources({ storage, api: migrationApi })
    ).resolves.toEqual({
      status: 'migrated',
      sourceIds: ['src-a', 'src-b', 'src-c'],
    });
    expect(migrationApi.savePreset).toHaveBeenCalledTimes(2);
    expect(storage.has(LEGACY_FAVORITE_SOURCES_KEY)).toBe(false);
    expect(storage.has(LEGACY_FAVORITE_FOLDERS_KEY)).toBe(false);
  });

  it('ソースがどれも無効なプリセットは飛ばして先へ進み、絞り込みには保存できたソースだけを使う', async () => {
    const storage = storageWithData();

    await expect(
      migrateLegacyFavoriteSources({
        storage,
        api: api([], ['skipped', 'skipped']),
      })
    ).resolves.toEqual({ status: 'migrated', sourceIds: [] });
    expect(storage.has(LEGACY_FAVORITE_SOURCES_KEY)).toBe(false);
  });

  it('保存に失敗したら localStorage を残す', async () => {
    const storage = storageWithData();

    await expect(
      migrateLegacyFavoriteSources({
        storage,
        api: api([], ['saved', 'failed']),
      })
    ).resolves.toEqual({ status: 'failed', reason: 'error' });
    expect(storage.has(LEGACY_FAVORITE_SOURCES_KEY)).toBe(true);
    expect(storage.has(LEGACY_FAVORITE_FOLDERS_KEY)).toBe(true);
  });

  it('プリセットの空きが無ければ何も保存せず limit を返し、localStorage を残す', async () => {
    const storage = storageWithData();
    const migrationApi = api(
      ids(10).map((id, i) => preset(id, `既存 ${i}`, ['src-z']))
    );

    await expect(
      migrateLegacyFavoriteSources({ storage, api: migrationApi })
    ).resolves.toEqual({ status: 'failed', reason: 'limit' });
    expect(migrationApi.savePreset).not.toHaveBeenCalled();
    expect(storage.has(LEGACY_FAVORITE_SOURCES_KEY)).toBe(true);
  });

  it('プリセットの一覧を取れない・Storage が例外を投げるときも失敗にし、移行中のまま止まらない', async () => {
    const storage = storageWithData();
    const failingList = {
      listPresets: jest.fn(async () => {
        throw new Error('network');
      }),
      savePreset: jest.fn(),
    };
    await expect(
      migrateLegacyFavoriteSources({ storage, api: failingList })
    ).resolves.toEqual({ status: 'failed', reason: 'error' });

    const throwingStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: jest.fn(),
    };
    await expect(
      migrateLegacyFavoriteSources({ storage: throwingStorage, api: api([]) })
    ).resolves.toEqual({ status: 'failed', reason: 'error' });
  });

  it('お気に入りが無ければ何も保存しない', async () => {
    const migrationApi = api([]);

    await expect(
      migrateLegacyFavoriteSources({
        storage: memoryStorage({}),
        api: migrationApi,
      })
    ).resolves.toEqual({ status: 'none' });
    expect(migrationApi.listPresets).not.toHaveBeenCalled();
  });
});
