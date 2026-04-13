import { createPrismaClient } from '@/lib/prisma/create-client';

const prisma = createPrismaClient();

const groupSeeds = [
  { id: 'group_company_japan', name: '日本企業技術ブログ', type: 'company_blog', ordering: 1 },
  { id: 'group_company_global', name: '海外企業技術ブログ', type: 'company_blog', ordering: 2 },
  { id: 'group_community', name: 'コミュニティ', type: 'community', ordering: 3 },
  { id: 'group_academic', name: '学術・研究', type: 'academic', ordering: 4 },
  { id: 'group_curated_domestic', name: '国内ポータル', type: 'news_portal', ordering: 5 },
  { id: 'group_presentation', name: 'プレゼンテーション', type: 'presentation', ordering: 6 },
];

const sourceGroups: Record<string, string[]> = {
  group_company_japan: [
    'cyberagent_tech_blog',
    'cookpad_tech_blog',
    'dena_tech_blog',
    'freee_tech_blog',
    'gmo_tech_blog',
    'hatena_tech_blog',
    'lycorp_tech_blog',
    'mercari_tech_blog',
    'moneyforward_tech_blog',
    'pepabo_tech_blog',
    'sansan_tech_blog',
    'smarthr_tech_blog',
    'zozo_tech_blog',
  ],
  group_company_global: [
    'cmdq4382o0000tecrle79yxxl',  // AWS
    'cmdq43ofy0000teolba9vrndf',  // Google Developers Blog
    'github_blog_202508',          // GitHub Blog
    'cmfwpq7dc0000te8m6fd12f0x',  // OpenAI Blog
    'cmdwmplco0001tec833nye4ak',  // Google AI Blog
    'cmdwmplc10000tec8vg2t9r2o',  // Hugging Face Blog
    'cmgimjzu90001te7f8ted8zsh',  // DeepMind Blog
    'cloudflare_blog_202508',      // Cloudflare Blog
    'mozilla_hacks_202508',        // Mozilla Hacks
    'medium_engineering_202508',   // Medium Engineering
    'cmgimjzu40000te7ffkqk2quc',  // NVIDIA Developer Blog
  ],
  group_community: [
    'cmdq3nww70003tegxm78oydnb',  // Dev.to
    'hacker_news_202508',          // Hacker News
    'cmdq3nwwz0008tegx2eu8cozq',  // Stack Overflow Blog
    'cmdq43k070000tekrnqlawd1y',  // SRE Weekly
  ],
  group_academic: [
    'cmfxa7efj0000teo06dhbox6e',  // Hugging Face Papers
    'cmfxa7efs0001teo0kjt70c5k',  // arXiv AI
  ],
  group_curated_domestic: [
    'cmdq440c90000tewuti7ng0un',  // Qiita Popular
    'cmdq3nwwp0006tegxz53w9zva',  // Zenn
    'cmdq3nww60000tegxi8ruki95',  // はてなブックマーク
    'cmdq3nwwf0004tegxuxj97z1k',  // InfoQ Japan
    'cmdq3nwwu0007tegxcstlc8zt',  // Publickey
    'cmdq3nwwk0005tegxdjv21wae',  // Think IT
    'cmfxa7efx0002teo03tglf5fs',  // Zenn AI
    'cmfxa7egc0003teo0ofke77yu',  // Qiita AI
  ],
  group_presentation: [
    'speakerdeck_8a450c43f9418ff6',  // Speaker Deck
    'docswell_a4539889f7debebd',      // Docswell
  ],
};

const tagSeeds = [
  // Region tags
  { id: 'tag_region_japan', name: '日本企業', category: 'region' },
  { id: 'tag_region_us', name: '米国企業', category: 'region' },
  { id: 'tag_region_eu', name: '欧州企業', category: 'region' },

  // Topic tags
  { id: 'tag_topic_ai', name: 'AI専門', category: 'topic' },
  { id: 'tag_topic_llm', name: 'LLM', category: 'topic' },
  { id: 'tag_topic_cloud', name: 'クラウド', category: 'topic' },
  { id: 'tag_topic_web', name: 'Web開発', category: 'topic' },
  { id: 'tag_topic_mobile', name: 'モバイル', category: 'topic' },
  { id: 'tag_topic_devtools', name: '開発ツール', category: 'topic' },

  // Org stage tags
  { id: 'tag_stage_startup', name: 'スタートアップ', category: 'org_stage' },
  { id: 'tag_stage_enterprise', name: 'エンタープライズ', category: 'org_stage' },
  { id: 'tag_stage_bigtech', name: 'Big Tech', category: 'org_stage' },
];

const tagAssignments = [
  // OpenAI Blog
  { sourceId: 'cmfwpq7dc0000te8m6fd12f0x', tagId: 'tag_region_us' },
  { sourceId: 'cmfwpq7dc0000te8m6fd12f0x', tagId: 'tag_topic_ai' },
  { sourceId: 'cmfwpq7dc0000te8m6fd12f0x', tagId: 'tag_topic_llm' },
  { sourceId: 'cmfwpq7dc0000te8m6fd12f0x', tagId: 'tag_stage_bigtech' },

  // Google AI Blog
  { sourceId: 'cmdwmplco0001tec833nye4ak', tagId: 'tag_region_us' },
  { sourceId: 'cmdwmplco0001tec833nye4ak', tagId: 'tag_topic_ai' },
  { sourceId: 'cmdwmplco0001tec833nye4ak', tagId: 'tag_stage_bigtech' },

  // Hugging Face Blog
  { sourceId: 'cmdwmplc10000tec8vg2t9r2o', tagId: 'tag_region_us' },
  { sourceId: 'cmdwmplc10000tec8vg2t9r2o', tagId: 'tag_topic_ai' },
  { sourceId: 'cmdwmplc10000tec8vg2t9r2o', tagId: 'tag_topic_llm' },
  { sourceId: 'cmdwmplc10000tec8vg2t9r2o', tagId: 'tag_stage_bigtech' },

  // NVIDIA Developer Blog
  { sourceId: 'cmgimjzu40000te7ffkqk2quc', tagId: 'tag_region_us' },
  { sourceId: 'cmgimjzu40000te7ffkqk2quc', tagId: 'tag_topic_ai' },
  { sourceId: 'cmgimjzu40000te7ffkqk2quc', tagId: 'tag_stage_bigtech' },

  // AWS
  { sourceId: 'cmdq4382o0000tecrle79yxxl', tagId: 'tag_region_us' },
  { sourceId: 'cmdq4382o0000tecrle79yxxl', tagId: 'tag_topic_cloud' },
  { sourceId: 'cmdq4382o0000tecrle79yxxl', tagId: 'tag_stage_bigtech' },

  // GitHub Blog
  { sourceId: 'github_blog_202508', tagId: 'tag_region_us' },
  { sourceId: 'github_blog_202508', tagId: 'tag_topic_devtools' },
  { sourceId: 'github_blog_202508', tagId: 'tag_stage_bigtech' },

  // CyberAgent
  { sourceId: 'cyberagent_tech_blog', tagId: 'tag_region_japan' },
  { sourceId: 'cyberagent_tech_blog', tagId: 'tag_topic_web' },
  { sourceId: 'cyberagent_tech_blog', tagId: 'tag_stage_enterprise' },

  // Cookpad
  { sourceId: 'cookpad_tech_blog', tagId: 'tag_region_japan' },
  { sourceId: 'cookpad_tech_blog', tagId: 'tag_topic_web' },
  { sourceId: 'cookpad_tech_blog', tagId: 'tag_stage_enterprise' },

  // freee
  { sourceId: 'freee_tech_blog', tagId: 'tag_region_japan' },
  { sourceId: 'freee_tech_blog', tagId: 'tag_stage_startup' },

  // DeepMind
  { sourceId: 'cmgimjzu90001te7f8ted8zsh', tagId: 'tag_region_eu' },
  { sourceId: 'cmgimjzu90001te7f8ted8zsh', tagId: 'tag_topic_ai' },
  { sourceId: 'cmgimjzu90001te7f8ted8zsh', tagId: 'tag_stage_bigtech' },

  // Hugging Face Papers
  { sourceId: 'cmfxa7efj0000teo06dhbox6e', tagId: 'tag_topic_ai' },
  { sourceId: 'cmfxa7efj0000teo06dhbox6e', tagId: 'tag_topic_llm' },
];

export async function migratePhase2Data() {
  try {
    await prisma.$transaction(async (tx) => {
      console.log('Disabling legacy Corporate Tech Blog...');
      await tx.source.update({
        where: { id: 'cmdwgsk1b0000te2vrjnpm6gc' },
        data: { enabled: false },
      });
      console.log('  Corporate Tech Blog disabled');

      console.log('Creating SourceGroups...');
      for (const group of groupSeeds) {
        await tx.sourceGroup.upsert({
          where: { id: group.id },
          create: group,
          update: { name: group.name, ordering: group.ordering },
        });
      }

      console.log('Assigning groupId to existing sources...');
      for (const [groupId, sourceIds] of Object.entries(sourceGroups)) {
        const result = await tx.source.updateMany({
          where: { id: { in: sourceIds } },
          data: { groupId },
        });
        console.log(`  ${groupId}: ${result.count} sources updated`);
      }

      console.log('Creating SourceTags...');
      for (const tag of tagSeeds) {
        await tx.sourceTag.upsert({
          where: { id: tag.id },
          create: tag,
          update: { name: tag.name, category: tag.category },
        });
      }

      console.log('Creating TagAssignments...');
      if (tagAssignments.length > 0) {
        await tx.sourceTagAssignment.createMany({
          data: tagAssignments,
          skipDuplicates: true,
        });
      }

      console.log('Validating migration...');
      await validate(tx);

      console.log('Migration validation passed');
    });

    console.log('Phase 2 data migration completed successfully');
  } catch (error) {
    console.error('Phase 2 data migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function validate(tx: any) {
  // 1. Check for orphaned sources
  const orphaned = await tx.source.count({
    where: { groupId: null, enabled: true },
  });

  if (orphaned > 0) {
    throw new Error(`${orphaned} enabled sources without groupId`);
  }

  // 2. Check group count
  const groupCount = await tx.sourceGroup.count();
  if (groupCount !== groupSeeds.length) {
    throw new Error(`Expected ${groupSeeds.length} source groups, got ${groupCount}`);
  }

  // 3. Check total source count
  const totalSources = await tx.source.count();
  console.log(`  Total sources: ${totalSources}`);

  // 4. Check group membership counts
  const groups = await tx.sourceGroup.findMany({
    include: { _count: { select: { sources: true } } },
  });

  const expectedCounts: Record<string, number> = {
    group_company_japan: 13,
    group_company_global: 11,  // 9 + Google AI + Hugging Face + NVIDIA
    group_community: 4,         // 3 + SRE Weekly
    group_academic: 2,
    group_curated_domestic: 8,
    group_presentation: 2,
  };

  console.log('Group membership counts:');
  for (const [groupId, expectedCount] of Object.entries(expectedCounts)) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) {
      throw new Error(`Missing group ${groupId}`);
    }

    console.log(`  ${group.name}: ${group._count.sources} sources (expected: ${expectedCount})`);

    if (group._count.sources !== expectedCount) {
      throw new Error(
        `Group ${groupId}: expected ${expectedCount}, got ${group._count.sources}`
      );
    }
  }

  // 5. Check tag count
  const tagCount = await tx.sourceTag.count();
  console.log(`  Total tags: ${tagCount}`);

  if (tagCount < tagSeeds.length) {
    throw new Error(`Expected at least ${tagSeeds.length} tags, got ${tagCount}`);
  }

  // 6. Check tag assignment count
  const assignmentCount = await tx.sourceTagAssignment.count();
  console.log(`  Total tag assignments: ${assignmentCount}`);
}

// Run if executed directly
if (require.main === module) {
  migratePhase2Data()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
