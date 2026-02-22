import { PrismaClient } from '@prisma/client';
import { PCA } from 'ml-pca';
import { UMAP } from 'umap-js';
import kmeans from 'ml-kmeans';

const prisma = new PrismaClient();

const BATCH_SIZE = 1000;
const PCA_TARGET_DIM = 50;
const UMAP_N_NEIGHBORS = 15;
const UMAP_MIN_DIST = 0.1;
const ELBOW_K_MIN = 10;
const ELBOW_K_MAX = 30;
const FALLBACK_K = 20;

interface EmbeddingRow {
  articleId: string;
  embedding: string;
}

function parseEmbedding(text: string): Float64Array {
  const inner = text.slice(1, -1);
  const values = inner.split(',');
  const arr = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    arr[i] = Number(values[i]);
  }
  return arr;
}

function computeInertia(
  data: number[][],
  assignments: number[],
  centroids: number[][]
): number {
  let total = 0;
  for (let i = 0; i < data.length; i++) {
    const centroid = centroids[assignments[i]];
    let dist = 0;
    for (let d = 0; d < data[i].length; d++) {
      const diff = data[i][d] - centroid[d];
      dist += diff * diff;
    }
    total += dist;
  }
  return total;
}

function findElbowK(data: number[][]): number {
  const inertias: { k: number; inertia: number }[] = [];

  console.log(`[KMeans] Testing k values from ${ELBOW_K_MIN} to ${ELBOW_K_MAX}...`);

  for (let k = ELBOW_K_MIN; k <= ELBOW_K_MAX; k += 2) {
    const result = kmeans(data, k, { initialization: 'kmeans++' });
    const inertia = computeInertia(data, result.clusters, result.centroids);
    inertias.push({ k, inertia });
    console.log(`  k=${k}: inertia=${inertia.toFixed(2)}`);
  }

  if (inertias.length < 3) {
    console.log(`[KMeans] Not enough data points for elbow detection, using fallback k=${FALLBACK_K}`);
    return FALLBACK_K;
  }

  // Elbow detection: find the k with the maximum second derivative (biggest bend)
  let bestK = FALLBACK_K;
  let maxSecondDeriv = -Infinity;

  for (let i = 1; i < inertias.length - 1; i++) {
    const secondDeriv =
      inertias[i - 1].inertia - 2 * inertias[i].inertia + inertias[i + 1].inertia;
    if (secondDeriv > maxSecondDeriv) {
      maxSecondDeriv = secondDeriv;
      bestK = inertias[i].k;
    }
  }

  console.log(`[KMeans] Elbow detected at k=${bestK}`);
  return bestK;
}

async function fetchAllEmbeddings(): Promise<{
  articleIds: string[];
  embeddings: Float64Array[];
}> {
  const articleIds: string[] = [];
  const embeddings: Float64Array[] = [];
  let offset = 0;

  console.log('[Fetch] Reading embeddings from database...');
  const startTime = Date.now();

  while (true) {
    const rows = await prisma.$queryRaw<EmbeddingRow[]>`
      SELECT ae."articleId", ae.embedding::text AS embedding
      FROM "ArticleEmbedding" ae
      WHERE ae."embeddingKey" = 'summary'
        AND ae.version = (
          SELECT MAX(ae2.version)
          FROM "ArticleEmbedding" ae2
          WHERE ae2."articleId" = ae."articleId"
            AND ae2."embeddingKey" = 'summary'
        )
      ORDER BY ae."articleId"
      LIMIT ${BATCH_SIZE}
      OFFSET ${offset}
    `;

    if (rows.length === 0) break;

    for (const row of rows) {
      articleIds.push(row.articleId);
      embeddings.push(parseEmbedding(row.embedding));
    }

    offset += rows.length;
    console.log(`[Fetch] Loaded ${articleIds.length} embeddings so far...`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Fetch] Done. Total: ${articleIds.length} embeddings in ${elapsed}s`);

  return { articleIds, embeddings };
}

function embeddingsToMatrix(embeddings: Float64Array[]): number[][] {
  return embeddings.map((e) => Array.from(e));
}

async function main(): Promise<void> {
  console.log('=== Semantic Atlas Computation ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  const totalStart = Date.now();

  // Step 1: Fetch embeddings
  const { articleIds, embeddings } = await fetchAllEmbeddings();

  if (articleIds.length === 0) {
    console.log('[WARN] No embeddings found. Exiting.');
    return;
  }

  const matrix = embeddingsToMatrix(embeddings);
  const dim = matrix[0].length;
  console.log(`[Info] Embedding dimension: ${dim}, count: ${matrix.length}`);

  // Step 2: PCA reduction (dim -> 50)
  console.log(`[PCA] Reducing ${dim} -> ${PCA_TARGET_DIM} dimensions...`);
  let pcaStart = Date.now();
  const pca = new PCA(matrix);
  const pcaReduced = pca.predict(matrix, { nComponents: PCA_TARGET_DIM }).to2DArray();
  console.log(`[PCA] Done in ${((Date.now() - pcaStart) / 1000).toFixed(1)}s`);

  // Step 3: UMAP 2D
  console.log('[UMAP-2D] Reducing 50 -> 2 dimensions...');
  let umapStart = Date.now();
  const umap2d = new UMAP({
    nNeighbors: UMAP_N_NEIGHBORS,
    minDist: UMAP_MIN_DIST,
    nComponents: 2,
  });
  const coords2d = umap2d.fit(pcaReduced);
  console.log(`[UMAP-2D] Done in ${((Date.now() - umapStart) / 1000).toFixed(1)}s`);

  // Step 4: UMAP 3D
  console.log('[UMAP-3D] Reducing 50 -> 3 dimensions...');
  umapStart = Date.now();
  const umap3d = new UMAP({
    nNeighbors: UMAP_N_NEIGHBORS,
    minDist: UMAP_MIN_DIST,
    nComponents: 3,
  });
  const coords3d = umap3d.fit(pcaReduced);
  console.log(`[UMAP-3D] Done in ${((Date.now() - umapStart) / 1000).toFixed(1)}s`);

  // Step 5: KMeans clustering on 3D coordinates
  console.log('[KMeans] Clustering on 3D coordinates...');
  const kmeansStart = Date.now();
  const optimalK = findElbowK(coords3d);
  const kmeansResult = kmeans(coords3d, optimalK, { initialization: 'kmeans++' });
  console.log(
    `[KMeans] Done in ${((Date.now() - kmeansStart) / 1000).toFixed(1)}s (k=${optimalK})`
  );

  // Step 6: Save to DB
  console.log('[Save] Upserting projections to ArticleProjection...');
  const saveStart = Date.now();
  const computedAt = new Date();

  // Build VALUES for bulk upsert
  const UPSERT_BATCH = 500;
  let upserted = 0;

  for (let i = 0; i < articleIds.length; i += UPSERT_BATCH) {
    const batchEnd = Math.min(i + UPSERT_BATCH, articleIds.length);
    const values: string[] = [];

    for (let j = i; j < batchEnd; j++) {
      const aid = articleIds[j].replace(/'/g, "''");
      const x2 = coords2d[j][0];
      const y2 = coords2d[j][1];
      const x3 = coords3d[j][0];
      const y3 = coords3d[j][1];
      const z3 = coords3d[j][2];
      const cluster = kmeansResult.clusters[j];
      values.push(
        `('${aid}', ${x2}, ${y2}, ${x3}, ${y3}, ${z3}, ${cluster}, '${computedAt.toISOString()}'::timestamptz)`
      );
    }

    const sql = `
      INSERT INTO "ArticleProjection" ("articleId", "x2d", "y2d", "x3d", "y3d", "z3d", "clusterId", "computedAt")
      VALUES ${values.join(',\n')}
      ON CONFLICT ("articleId")
      DO UPDATE SET
        "x2d" = EXCLUDED."x2d",
        "y2d" = EXCLUDED."y2d",
        "x3d" = EXCLUDED."x3d",
        "y3d" = EXCLUDED."y3d",
        "z3d" = EXCLUDED."z3d",
        "clusterId" = EXCLUDED."clusterId",
        "computedAt" = EXCLUDED."computedAt"
    `;

    await prisma.$executeRawUnsafe(sql);
    upserted += batchEnd - i;
    console.log(`[Save] Upserted ${upserted}/${articleIds.length}`);
  }

  console.log(`[Save] Done in ${((Date.now() - saveStart) / 1000).toFixed(1)}s`);

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`\n=== Computation Complete ===`);
  console.log(`Total articles: ${articleIds.length}`);
  console.log(`Clusters: ${optimalK}`);
  console.log(`Total time: ${totalElapsed}s`);
}

main()
  .catch((error) => {
    console.error('[FATAL] Atlas computation failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
