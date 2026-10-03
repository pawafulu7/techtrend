/**
 * resolveTags の結合テスト（実 DB、#672）
 *
 * lower(name) での照合、ON CONFLICT DO NOTHING、adapter-pg での text[] の受け渡しは
 * モックでは確かめられないため、実 DB で確かめる。
 * 実行: npm run test:integration:docker
 */
import { prisma } from '@/lib/prisma';
import {
  resolveTags,
  getOrCreateTags,
  findTagIdsByNames,
} from '@/lib/services/tag-service';

// 他のデータと衝突しないよう、テストごとに固有の接頭辞を付ける
const P = `it672x${Date.now()}`;

async function tagsWithKey(key: string) {
  return prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name FROM "Tag" WHERE lower(name) = lower(${key}) ORDER BY name
  `;
}

describe('resolveTags (integration, #672)', () => {
  afterEach(async () => {
    await prisma.$executeRaw`DELETE FROM "Tag" WHERE lower(name) LIKE ${`${P.toLowerCase()}%`}`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns the existing tag for a differently-cased name without creating one', async () => {
    const existing = await prisma.tag.create({ data: { id: `${P}-id`, name: `${P}MCP` } });

    const [tag] = await resolveTags([{ name: `${P}Mcp` }]);

    expect(tag).toEqual({ id: existing.id, name: `${P}MCP`, category: null });
    expect(await tagsWithKey(`${P}mcp`)).toHaveLength(1);
  });

  it('collapses differently-cased inputs into one tag and keeps input order', async () => {
    const tags = await resolveTags([
      { name: `${P}Rust` },
      { name: `  ${P}LLAMA ` },
      { name: `${P}llama` },
      { name: '' },
    ]);

    expect(tags.map((t) => t.name)).toEqual([`${P}Rust`, `${P}LLAMA`]);
    expect(await tagsWithKey(`${P}llama`)).toHaveLength(1);
  });

  it('prefers the exact spelling when several existing tags share the key', async () => {
    await prisma.tag.createMany({
      data: [
        { id: `${P}-a`, name: `${P}Llama` },
        { id: `${P}-b`, name: `${P}LLaMA` },
      ],
    });

    // "Llama" は C 照合順では 2 番目（"LLaMA" < "Llama"）。完全一致の優先が無いと -b が返る
    const [exact] = await resolveTags([{ name: `${P}Llama` }]);
    const [other] = await resolveTags([{ name: `${P}LLAMA` }]);

    expect(exact.id).toBe(`${P}-a`);
    // 完全一致が無ければ name の C 照合順で最初（大文字が先: "LLaMA" < "Llama"）
    expect(other.id).toBe(`${P}-b`);
  });

  it('applies maxTags after removing differently-cased duplicates', async () => {
    const tags = await getOrCreateTags(
      [`${P}MCP`, `${P}Mcp`, `${P}Rust`],
      { normalize: false, maxTags: 2 }
    );

    expect(tags.map((t) => t.name)).toEqual([`${P}MCP`, `${P}Rust`]);
  });

  it('stores the category of newly created tags', async () => {
    const [tag] = await resolveTags([{ name: `${P}Kotlin`, category: 'language' }]);

    expect(tag.category).toBe('language');
  });

  it('takes the category of a differently-cased input for a new tag', async () => {
    const [tag] = await resolveTags([
      { name: `${P}Swift` },
      { name: `${P}SWIFT`, category: 'language' },
    ]);

    expect(tag.name).toBe(`${P}Swift`);
    expect(tag.category).toBe('language');
  });

  it('findTagIdsByNames matches by lower(name) and treats _ and % literally', async () => {
    await prisma.tag.createMany({
      data: [
        { id: `${P}-u`, name: `${P}Claude_Code` },
        { id: `${P}-s`, name: `${P}Claude Code` },
        { id: `${P}-m`, name: `${P}MCP` },
      ],
    });

    expect(await findTagIdsByNames([`${P}claude_code`])).toEqual([`${P}-u`]);
    expect(await findTagIdsByNames([`${P}mcp`, `${P}Rust`])).toEqual([`${P}-m`]);
    expect(await findTagIdsByNames(['%'])).toEqual([]);
  });

  it('works inside an interactive transaction', async () => {
    const tags = await prisma.$transaction(async (tx) =>
      resolveTags([{ name: `${P}Go` }, { name: `${P}GO` }], tx)
    );

    expect(tags).toHaveLength(1);
    expect(await tagsWithKey(`${P}go`)).toHaveLength(1);
  });
});
