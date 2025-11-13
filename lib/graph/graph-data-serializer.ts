import { GraphNode, GraphLink, GraphData, CATEGORY_COLORS } from '@/lib/types/graph';
import { Article } from '@prisma/client';
import { logger } from '@/lib/logger';

/**
 * Graph Data Serializer
 *
 * Converts article relationship data to GraphData format.
 * Server-side transformation for security and performance.
 *
 * CodexMCP recommendations:
 * - Normalize Article/RelatedArticle via toGraphNodeInput()
 * - Use lookup table for category detection (not regex everywhere)
 * - Resilient error handling (best-effort graphs)
 * - Log missing data, fallback to defaults
 *
 * @see Plan: .claude/docs/plan/plan_20251111_233131_021_article-relationship-graph.md
 */

/**
 * Normalized input for GraphNode creation
 *
 * CodexMCP: Unified interface for Article and RelatedArticle
 */
interface GraphNodeInput {
  id: string;
  title: string;
  tags?: Array<{ id?: string; name: string }>;  // Phase 2: id optional
  url?: string;
  qualityScore?: number;  // Phase 2: optional (default 0)
  publishedAt: Date | string;
  summary?: string;
  thumbnail?: string;
  sourceName?: string;
  similarity?: number;
  commonTags?: number;
  category?: string;  // Phase 2: pre-computed category (avoid re-calculation)
}

/**
 * Category Detection Rules
 *
 * CodexMCP: Lookup table approach (not regex everywhere)
 */
const CATEGORY_RULES: Array<{
  keywords: string[];
  category: string;
  priority: number;
}> = [
  { keywords: ['React', 'Vue', 'Angular', 'Svelte', 'Frontend', 'UI', 'CSS'], category: 'Frontend', priority: 10 },
  { keywords: ['AI', 'ML', 'LLM', 'Machine Learning', 'Deep Learning', 'Neural', 'GPT', 'Gemini'], category: 'AI/ML', priority: 10 },
  { keywords: ['Node.js', 'Express', 'Backend', 'API', 'REST', 'GraphQL', 'Server'], category: 'Backend', priority: 9 },
  { keywords: ['DevOps', 'Docker', 'Kubernetes', 'K8s', 'CI/CD', 'GitHub Actions'], category: 'DevOps', priority: 9 },
  { keywords: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Database', 'SQL'], category: 'Database', priority: 8 },
  { keywords: ['Security', 'Auth', 'OAuth', 'JWT', 'XSS', 'CSRF', 'Encryption'], category: 'Security', priority: 8 },
  { keywords: ['Test', 'Jest', 'Playwright', 'E2E', 'Unit Test', 'TDD'], category: 'Testing', priority: 7 },
];

export class GraphDataSerializer {
  // Node sizing constants (Phase 2: hybrid quality × similarity)
  private static readonly MIN_QUALITY_SCORE = 4;
  private static readonly CENTER_NODE_SCALE = 1.4;
  private static readonly RELATED_NODE_SCALE = 0.85;
  private static readonly MIN_NODE_SIZE = 30;
  private static readonly MAX_NODE_SIZE = 140;

  // Color brightness adjustment constants (Phase 2)
  private static readonly MIN_BRIGHTNESS_FACTOR = 0.7;  // Low similarity dimming
  private static readonly BRIGHTNESS_RANGE = 0.6;       // Similarity impact range [0.7, 1.3]

  /**
   * Serialize tag-based relationships to GraphData
   *
   * @param centerArticle - The center article (full Article object)
   * @param relatedArticles - Related articles (lightweight objects)
   * @returns GraphData with nodes and links
   */
  static serializeTagBased(
    centerArticle: Article & { tags: Array<{ id: string; name: string }> },
    relatedArticles: GraphNodeInput[]
  ): GraphData {
    try {
      // Normalize center article
      const centerNode = this.toGraphNode(
        this.toGraphNodeInput(centerArticle),
        true  // isCenter
      );

      // Normalize related articles
      const relatedNodes = relatedArticles
        .map(article => {
          try {
            return this.toGraphNode(article, false);
          } catch (error) {
            // CodexMCP: Best-effort, skip invalid nodes
            logger.warn({
              articleId: article.id,
              error: error instanceof Error ? error.message : String(error),
            }, 'Skipping invalid node in graph serialization');
            return null;
          }
        })
        .filter((node): node is GraphNode => node !== null);

      // Generate links (center → related)
      const links: GraphLink[] = relatedNodes.map(node => ({
        source: centerNode.id,
        target: node.id,
        value: this.findArticleSimilarity(relatedArticles, node.id) || 0,
        type: 'tag',
        commonTags: this.findArticleCommonTags(relatedArticles, node.id),
      }));

      // Calculate result stats (CodexMCP: guard against empty arrays)
      const similarities = links.map(l => l.value);
      const categoryCounts = this.countCategories([centerNode, ...relatedNodes]);

      const graphData: GraphData = {
        nodes: [centerNode, ...relatedNodes],
        links,
        metadata: {
          centerArticleId: centerNode.id,
          algorithm: 'tag',
          nodeCount: relatedNodes.length + 1,
          linkCount: links.length,
          timestamp: new Date().toISOString(),
          options: {
            algorithm: 'tag',
            maxNodes: relatedArticles.length,
            minSimilarity: similarities.length > 0 ? Math.min(...similarities) : 0,
          },
          resultStats: {
            maxSimilarity: similarities.length > 0 ? Math.max(...similarities) : 0,
            minSimilarity: similarities.length > 0 ? Math.min(...similarities) : 0,
            avgSimilarity: similarities.length > 0
              ? similarities.reduce((sum, val) => sum + val, 0) / similarities.length
              : 0,
            categoryCounts,
          },
        },
      };

      logger.info({
        centerArticleId: centerNode.id,
        nodeCount: graphData.nodes.length,
        linkCount: graphData.links.length,
        algorithm: 'tag',
      }, 'Graph data serialized (tag-based)');

      return graphData;

    } catch (error) {
      logger.error({
        centerArticleId: centerArticle.id,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to serialize graph data');

      throw error;
    }
  }

  /**
   * Serialize embedding-based graph data (Phase 2)
   *
   * Converts embedding search results to GraphData format
   *
   * @param centerArticle - Center article
   * @param embeddingResults - Similar articles from VectorSearchService
   * @returns GraphData for visualization
   */
  static serializeEmbeddingBased(
    centerArticle: Article & { tags: Array<{ id: string; name: string }> },
    embeddingResults: Array<{
      articleId: string;
      title: string;
      summary: string | null;
      publishedAt: Date;
      qualityScore?: number;
      sourceName?: string;
      tags?: Array<{ id: string; name: string }>;
      thumbnail?: string | null;
      similarity: number;
    }>
  ): GraphData {
    try {
      // Convert SearchResult to GraphNodeInput
      const centerTags = centerArticle.tags.map(t => t.name);
      
      const relatedInputs: GraphNodeInput[] = embeddingResults.map(result => {
        const resultTags = result.tags?.map(t => t.name) || [];
        
        return {
          id: result.articleId,
          title: result.title,
          tags: result.tags || [],
          url: `/articles/${result.articleId}`,
          qualityScore: result.qualityScore ?? 0,
          publishedAt: result.publishedAt,
          summary: result.summary || '',
          thumbnail: result.thumbnail || undefined,
          sourceName: result.sourceName,
          similarity: result.similarity,
          commonTags: this.countCommonTags(centerTags, resultTags),
          category: this.getCategory(result.tags || []),  // Pre-compute
        };
      });

      // Normalize center article
      const centerNode = this.toGraphNode(
        this.toGraphNodeInput(centerArticle),
        true  // isCenter
      );

      // Normalize related articles
      const relatedNodes = relatedInputs
        .map(input => {
          try {
            return this.toGraphNode(input, false);
          } catch (error) {
            // CodexMCP: Best-effort, skip invalid nodes
            logger.warn({
              articleId: input.id,
              error: error instanceof Error ? error.message : String(error),
            }, 'Skipping invalid node in graph serialization');
            return null;
          }
        })
        .filter((node): node is GraphNode => node !== null);

      // Generate links (center → related)
      const links: GraphLink[] = relatedInputs
        .filter(input => relatedNodes.some(node => node.id === input.id))
        .map(input => ({
          source: centerNode.id,
          target: input.id,
          value: input.similarity || 0,
          type: 'embedding',
          commonTags: input.commonTags,
        }));

      // Calculate result stats (CodexMCP: guard against empty arrays)
      const similarities = links.map(l => l.value);
      const categoryCounts = this.countCategories([centerNode, ...relatedNodes]);

      const graphData: GraphData = {
        nodes: [centerNode, ...relatedNodes],
        links,
        metadata: {
          centerArticleId: centerNode.id,
          algorithm: 'embedding',
          nodeCount: relatedNodes.length + 1,
          linkCount: links.length,
          timestamp: new Date().toISOString(),
          options: {
            algorithm: 'embedding',
            maxNodes: embeddingResults.length,
            minSimilarity: similarities.length > 0 ? Math.min(...similarities) : 0,
          },
          resultStats: {
            maxSimilarity: similarities.length > 0 ? Math.max(...similarities) : 0,
            minSimilarity: similarities.length > 0 ? Math.min(...similarities) : 0,
            avgSimilarity: similarities.length > 0
              ? similarities.reduce((sum, val) => sum + val, 0) / similarities.length
              : 0,
            categoryCounts,
          },
        },
      };

      logger.info({
        centerArticleId: centerNode.id,
        nodeCount: graphData.nodes.length,
        linkCount: graphData.links.length,
        algorithm: 'embedding',
      }, 'Graph data serialized (embedding-based)');

      return graphData;

    } catch (error) {
      logger.error({
        centerArticleId: centerArticle.id,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to serialize graph data (embedding)');

      throw error;
    }
  }

  /**
   * Normalize Article to GraphNodeInput
   *
   * CodexMCP: Conversion layer for full Article objects
   */
  private static toGraphNodeInput(
    article: Article & { tags?: Array<{ id: string; name: string }> }
  ): GraphNodeInput {
    return {
      id: article.id,
      title: article.title,
      tags: article.tags || [],
      url: article.url,
      qualityScore: article.qualityScore,
      publishedAt: article.publishedAt,
      summary: article.summary || undefined,
      thumbnail: article.thumbnail || undefined,
    };
  }

  /**
   * Convert GraphNodeInput to GraphNode
   *
   * CodexMCP: Unified conversion logic for center and related articles
   */
  private static toGraphNode(input: GraphNodeInput, isCenter: boolean): GraphNode {
    // CodexMCP: Throw early if required fields missing
    if (!input.id || !input.title) {
      throw new Error(`Missing required fields: id=${input.id}, title=${input.title}`);
    }

    // Phase 2: Use pre-computed category or calculate
    const category = input.category ?? this.getCategory(input.tags || []);
    const baseColor = this.getCategoryColor(category);

    // CodexMCP Phase 2: Adjust color brightness by similarity
    const color = isCenter ? '#FBBF24' : this.adjustColorForSimilarity(baseColor, input.similarity);

    // CodexMCP Phase 2: Clamp qualityScore to minimum baseline
    const qualityScore = Math.max(input.qualityScore ?? 0, this.MIN_QUALITY_SCORE);

    // CodexMCP Phase 2: Hybrid node size (quality * similarity)
    let val: number;
    if (isCenter) {
      val = qualityScore * this.CENTER_NODE_SCALE;  // Center: enhanced visibility (larger than related nodes)
    } else if (input.similarity) {
      // Related: hybrid (quality * similarity * factor)
      const hybridSize = input.similarity * qualityScore * this.RELATED_NODE_SCALE;
      val = Math.min(Math.max(hybridSize, this.MIN_NODE_SIZE), this.MAX_NODE_SIZE);  // Clamp to 30-140
    } else {
      // Fallback: quality-based
      val = qualityScore;
    }

    return {
      id: input.id,
      label: isCenter ? `[中心] ${input.title}` : input.title,  // CodexMCP: Badge for center node
      val,  // CodexMCP Phase 2: Hybrid size (quality * similarity)
      color,  // CodexMCP: Similarity-adjusted color
      category,
      publishedAt: this.toISOString(input.publishedAt),
      url: input.url || `/articles/${input.id}`,
      summary: input.summary,
      thumbnail: input.thumbnail,
      sourceName: input.sourceName,
      primaryTag: input.tags?.[0]?.name,
    };
  }

  /**
   * Detect category from tags
   *
   * CodexMCP: Lookup table approach (not regex everywhere)
   */
  private static getCategory(tags: Array<{ name: string }>): string {
    const tagNames = tags.map(t => t.name);

    // Find best matching category (highest priority match)
    let bestMatch: { category: string; priority: number } | null = null;

    for (const rule of CATEGORY_RULES) {
      const matched = rule.keywords.some(keyword =>
        tagNames.some(tag => tag.includes(keyword))
      );

      if (matched && (!bestMatch || rule.priority > bestMatch.priority)) {
        bestMatch = { category: rule.category, priority: rule.priority };
      }
    }

    return bestMatch?.category || 'Other';
  }

  /**
   * Get category color
   *
   * CodexMCP: Lookup from CATEGORY_COLORS mapping
   */
  private static getCategoryColor(category: string): string {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
  }

  /**
   * Adjust color for center node (brighter)
   */
  private static adjustColorForCenter(color: string): string {
    // Make center node stand out (slightly brighter)
    // Convert hex to RGB, increase brightness, convert back
    // For simplicity, just return same color with opacity flag or distinct shade
    return color;  // TODO: Implement brightness adjustment if needed
  }

  /**
   * Convert Date or string to ISO 8601 string
   */
  private static toISOString(date: Date | string): string {
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  }

  /**
   * Count common tags between two tag lists (Phase 2)
   *
   * @param tags1 - First tag list (tag names)
   * @param tags2 - Second tag list (tag names)
   * @returns Number of common tags
   */
  private static countCommonTags(tags1: string[], tags2: string[]): number {
    const set1 = new Set(tags1);
    const set2 = new Set(tags2);
    return [...set1].filter(t => set2.has(t)).length;
  }

  /**
   * Adjust color brightness based on similarity (Phase 2)
   *
   * CodexMCP: Hybrid - category (hue) + similarity (lightness)
   */
  private static adjustColorForSimilarity(baseColor: string, similarity?: number): string {
    if (!similarity) return baseColor;

    // Validate hex format (CodeRabbit: prevent parseInt issues)
    if (!/^#[0-9A-Fa-f]{6}$/.test(baseColor)) {
      logger.warn({ baseColor }, 'Invalid color format, using as-is');
      return baseColor;
    }

    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);

    // Brightness factor: [0.7, 1.3] for similarity [0, 1]
    const factor = this.MIN_BRIGHTNESS_FACTOR + similarity * this.BRIGHTNESS_RANGE;

    const rAdj = Math.min(Math.round(r * factor), 255);
    const gAdj = Math.min(Math.round(g * factor), 255);
    const bAdj = Math.min(Math.round(b * factor), 255);

    return `#${rAdj.toString(16).padStart(2, '0')}${gAdj.toString(16).padStart(2, '0')}${bAdj.toString(16).padStart(2, '0')}`;
  }

  /**
   * Find article similarity from related articles array
   */
  private static findArticleSimilarity(
    relatedArticles: GraphNodeInput[],
    articleId: string
  ): number | undefined {
    return relatedArticles.find(a => a.id === articleId)?.similarity;
  }

  /**
   * Find article common tags count
   */
  private static findArticleCommonTags(
    relatedArticles: GraphNodeInput[],
    articleId: string
  ): number | undefined {
    return relatedArticles.find(a => a.id === articleId)?.commonTags;
  }

  /**
   * Count articles per category
   */
  private static countCategories(nodes: GraphNode[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const node of nodes) {
      counts[node.category] = (counts[node.category] || 0) + 1;
    }

    return counts;
  }
}
