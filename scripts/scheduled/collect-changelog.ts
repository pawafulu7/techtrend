import { prisma } from '@/lib/prisma';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseChangelog } from '../../lib/changelog/parser';
import { RedisCache } from '../../lib/cache';
import { env } from '@/lib/config/env';

const FETCH_TIMEOUT_MS = 30_000;
const USER_AGENT = 'TechTrend-ChangelogCollector/1.0';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const TRANSLATION_BATCH_SIZE = 30;

const PROJECTS = [
  {
    slug: 'claude-code',
    name: 'Claude Code',
    sourceUrl: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
    iconUrl: null,
    rawUrl: 'https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md',
  },
];

async function fetchChangelog(rawUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} for ${rawUrl}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

interface TranslatedEntry {
  titleJa: string;
  contentJa: string;
}

/**
 * Translate an array of English changelog entries to Japanese using Gemini Flash Lite.
 * Each entry is translated into a short Japanese title and a detailed Japanese description.
 * Returns a map of original content -> { titleJa, contentJa }.
 */
async function translateEntries(
  entries: string[],
  apiKey: string
): Promise<Map<string, TranslatedEntry>> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const translations = new Map<string, TranslatedEntry>();

  // Process in batches
  for (let i = 0; i < entries.length; i += TRANSLATION_BATCH_SIZE) {
    const batch = entries.slice(i, i + TRANSLATION_BATCH_SIZE);
    const numberedEntries = batch.map((e, idx) => `${idx + 1}. ${e}`).join('\n');

    const prompt = `You are a software changelog translator. For each English changelog entry below, output:
1. A short Japanese title (max 30 chars) summarizing the change
2. A detailed Japanese description translating the full entry

Keep technical terms (API names, CLI commands, file paths, etc.) in their original form.
Use the format: NUMBER. TITLE | DESCRIPTION
Do not add any other text or explanations.

${numberedEntries}`;

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await model.generateContent(
          {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 8192,
              temperature: 0.3,
            },
          },
          { timeout: 60_000 }
        );

        const responseText = result.response.text();
        const lines = responseText.split('\n').filter((l) => l.trim());
        const attemptTranslations = new Map<string, TranslatedEntry>();
        const translatedIndexes = new Set<number>();

        for (const line of lines) {
          const match = line.match(/^(\d+)\.\s*(.+)/);
          if (match) {
            const idx = parseInt(match[1], 10) - 1;
            if (idx >= 0 && idx < batch.length) {
              const content = match[2].trim();
              const pipeIdx = content.indexOf('|');
              if (pipeIdx > 0) {
                attemptTranslations.set(batch[idx], {
                  titleJa: content.substring(0, pipeIdx).trim(),
                  contentJa: content.substring(pipeIdx + 1).trim(),
                });
                translatedIndexes.add(idx);
              } else {
                // Fallback: no pipe separator, use first 30 chars as title
                attemptTranslations.set(batch[idx], {
                  titleJa: content.length > 30 ? content.substring(0, 30) + '...' : content,
                  contentJa: content,
                });
                translatedIndexes.add(idx);
              }
            }
          }
        }
        if (translatedIndexes.size < batch.length) {
          throw new Error(
            `Incomplete translation response: ${translatedIndexes.size}/${batch.length}`
          );
        }
        // 全件成功した場合のみ本体に反映
        for (const [k, v] of attemptTranslations) {
          translations.set(k, v);
        }
        break; // 成功したらループ抜ける
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          console.error(
            `[WARN] Translation batch failed after ${MAX_ATTEMPTS} attempts (entries ${i + 1}-${i + batch.length}):`,
            error instanceof Error ? error.message : String(error)
          );
          break;
        }
        const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
        console.log(
          `[WARN] Retry ${attempt}/${MAX_ATTEMPTS} after ${delay}ms (entries ${i + 1}-${i + batch.length}):`,
          error instanceof Error ? error.message : String(error)
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  return translations;
}

async function collectChangelog(): Promise<void> {
  const startTime = Date.now();
  let totalVersionsUpserted = 0;
  let totalEntries = 0;
  let totalTranslated = 0;

  const geminiApiKey = env.GEMINI_API_KEY;
  const translationEnabled = !!geminiApiKey;

  if (!translationEnabled) {
    console.log('[WARN] GEMINI_API_KEY not set. Skipping Japanese translation.');
  }

  try {
    for (const projectConfig of PROJECTS) {
      let projectEntries = 0;
      let projectTranslated = 0;
      console.log(`[INFO] Fetching changelog for ${projectConfig.name}...`);

      // Fetch CHANGELOG.md
      const markdown = await fetchChangelog(projectConfig.rawUrl);
      console.log(`[INFO] Fetched ${markdown.length} bytes`);

      // Parse
      const parsed = parseChangelog(markdown);
      console.log(`[INFO] Parsed ${parsed.versions.length} versions`);

      if (parsed.versions.length === 0) {
        console.warn(`[WARN] No versions found in changelog for ${projectConfig.name}. Skipping.`);
        continue;
      }

      // Upsert project
      const project = await prisma.changelogProject.upsert({
        where: { slug: projectConfig.slug },
        create: {
          slug: projectConfig.slug,
          name: projectConfig.name,
          sourceUrl: projectConfig.sourceUrl,
          iconUrl: projectConfig.iconUrl,
        },
        update: {
          name: projectConfig.name,
          sourceUrl: projectConfig.sourceUrl,
          iconUrl: projectConfig.iconUrl,
        },
      });

      console.log(`[INFO] Project upserted: ${project.slug} (id: ${project.id})`);

      // Collect all unique entries that need translation
      // Only translate entries that don't already have a Japanese translation
      let translationMap = new Map<string, TranslatedEntry>();
      const newlyTranslatedKeys = new Set<string>();

      if (translationEnabled) {
        // Get existing translations from DB
        const existingEntries = await prisma.changelogEntry.findMany({
          where: {
            version: { projectId: project.id },
            titleJa: { not: null },
            contentJa: { not: null },
          },
          select: { content: true, titleJa: true, contentJa: true },
        });
        const existingTranslations = new Map<string, TranslatedEntry>();
        for (const e of existingEntries) {
          if (e.titleJa && e.contentJa) {
            existingTranslations.set(e.content, { titleJa: e.titleJa, contentJa: e.contentJa });
          }
        }

        // Find entries that need translation (deduplicate across versions)
        const needsTranslation: string[] = [];
        const seen = new Set<string>();
        for (const v of parsed.versions) {
          for (const entry of v.entries) {
            if (!existingTranslations.has(entry.content) && !seen.has(entry.content)) {
              needsTranslation.push(entry.content);
              seen.add(entry.content);
            }
          }
        }

        if (needsTranslation.length > 0) {
          console.log(`[INFO] Translating ${needsTranslation.length} new entries...`);
          translationMap = await translateEntries(needsTranslation, geminiApiKey!);
          for (const key of translationMap.keys()) {
            newlyTranslatedKeys.add(key);
          }
          console.log(`[INFO] Translated ${translationMap.size}/${needsTranslation.length} entries`);
        } else {
          console.log('[INFO] No new entries need translation');
        }

        // Merge existing translations
        for (const [k, v] of existingTranslations) {
          if (!translationMap.has(k)) translationMap.set(k, v);
        }
      }

      // Upsert versions and entries
      for (const parsedVersion of parsed.versions) {
        // Upsert version
        const version = await prisma.changelogVersion.upsert({
          where: {
            projectId_version: {
              projectId: project.id,
              version: parsedVersion.version,
            },
          },
          create: {
            projectId: project.id,
            version: parsedVersion.version,
            sortOrder: parsedVersion.sortOrder,
          },
          update: {
            sortOrder: parsedVersion.sortOrder,
          },
        });

        // Replace entries within a transaction (deleteMany + createMany)
        const entryData = parsedVersion.entries.map((entry, index) => {
          const translated = translationMap.get(entry.content) || null;
          if (translated && newlyTranslatedKeys.has(entry.content)) {
            totalTranslated++;
            projectTranslated++;
          }
          return {
            versionId: version.id,
            content: entry.content,
            titleJa: translated?.titleJa || null,
            contentJa: translated?.contentJa || null,
            category: entry.category,
            orderIndex: index,
          };
        });

        await prisma.$transaction([
          prisma.changelogEntry.deleteMany({
            where: { versionId: version.id },
          }),
          prisma.changelogEntry.createMany({
            data: entryData,
          }),
        ]);

        totalVersionsUpserted++;
        totalEntries += entryData.length;
        projectEntries += entryData.length;
      }

      console.log(`[INFO] ${projectConfig.name}: ${parsed.versions.length} versions, ${projectEntries} entries upserted (${projectTranslated} translated)`);
    }

    // Cache invalidation（changelog名前空間を直接クリア）
    console.log('[INFO] Invalidating changelog cache...');
    try {
      const changelogCache = new RedisCache({
        ttl: 3600,
        namespace: '@techtrend/cache:changelog',
      });
      await changelogCache.invalidatePattern('*');
      console.log('[INFO] Changelog cache invalidated successfully');
    } catch (error) {
      console.error(
        '[WARN] Cache invalidation failed, but data was saved successfully:',
        error instanceof Error ? error.message : String(error)
      );
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`[INFO] Changelog collection completed in ${duration}s: ${totalVersionsUpserted} versions, ${totalEntries} entries, ${totalTranslated} translated`);
  } finally {
    await prisma.$disconnect();
  }
}

// Self-executing main
collectChangelog()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[ERROR] Changelog collection failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
