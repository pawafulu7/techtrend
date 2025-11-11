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
  tags?: Array<{ id: string; name: string }>;
  url?: string;
  qualityScore: number;
  publishedAt: Date | string;
  summary?: string;
  thumbnail?: string;
  sourceName?: string;
  similarity?: number;
  commonTags?: number;
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

      // Calculate result stats
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
            minSimilarity: Math.min(...similarities),
          },
          resultStats: {
            maxSimilarity: Math.max(...similarities),
            minSimilarity: Math.min(...similarities),
            avgSimilarity: similarities.reduce((sum, val) => sum + val, 0) / similarities.length,
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

    const category = this.getCategory(input.tags || []);
    const color = this.getCategoryColor(category);

    return {
      id: input.id,
      label: input.title,
      val: input.qualityScore,
      color: isCenter ? this.adjustColorForCenter(color) : color,
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
