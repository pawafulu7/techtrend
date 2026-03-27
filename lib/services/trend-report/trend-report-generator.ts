import { PrismaClient, TrendPeriodType, Prisma } from '@prisma/client';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import logger from '@/lib/logger';
import { GEMINI_API } from '@/lib/constants';
import type {
  TopArticleInfo,
  CategoryInfo,
  TagInfo,
  TrendReportData,
} from './types';
import { PROMPT_VERSION } from './types';
import {
  fetchArticles,
  calculateTopArticles,
  calculateCategories,
  calculateTags,
  getDayRangeJST,
  getWeekRangeJST,
  getMonthRangeJST,
} from './trend-data-aggregator';
import { generateAISummary } from './trend-ai-summary-generator';

export class TrendReportGenerator {
  private prisma: PrismaClient;
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;

    // Gemini API initialization (optional)
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: GEMINI_API.TREND_MODEL,
      });
    }
  }

  /**
   * Generate daily trend report.
   */
  async generateDailyReport(targetDate?: Date): Promise<string> {
    const date = targetDate || new Date();
    const { start, end } = getDayRangeJST(date);

    return this.generateReport(TrendPeriodType.DAILY, start, end);
  }

  /**
   * Generate weekly trend report.
   */
  async generateWeeklyReport(targetDate?: Date): Promise<string> {
    const date = targetDate || new Date();
    const { start, end } = getWeekRangeJST(date);

    return this.generateReport(TrendPeriodType.WEEKLY, start, end);
  }

  /**
   * Generate monthly trend report.
   */
  async generateMonthlyReport(targetDate?: Date): Promise<string> {
    const date = targetDate || new Date();
    const { start, end } = getMonthRangeJST(date);

    return this.generateReport(TrendPeriodType.MONTHLY, start, end);
  }

  /**
   * Generate trend report (common logic).
   */
  private async generateReport(
    periodType: TrendPeriodType,
    periodStart: Date,
    periodEnd: Date
  ): Promise<string> {
    try {
      // Check for existing report
      const existing = await this.prisma.trendReport.findUnique({
        where: {
          periodType_periodStart: {
            periodType,
            periodStart,
          },
        },
      });

      if (existing) {
        logger.info(
          `Trend report already exists for ${periodType} starting ${periodStart.toISOString()}`
        );
        return existing.id;
      }

      // Fetch article data
      const articles = await fetchArticles(this.prisma, periodStart, periodEnd);

      if (articles.length === 0) {
        logger.warn(
          `No articles found for ${periodType} period ${periodStart.toISOString()} - ${periodEnd.toISOString()}`
        );
      }

      // Calculate statistics
      const topArticles = calculateTopArticles(articles);
      const categories = calculateCategories(articles);
      const tags = calculateTags(articles);

      // AI summary generation (optional)
      let aiSummary: string | undefined;
      let aiSummaryFormat: 'json' | 'text' | undefined;
      let aiModel: string | undefined;
      let generatedAt: Date | undefined;

      if (this.model && articles.length > 0) {
        try {
          const aiSummaryResult = await generateAISummary(
            this.model,
            this.prisma,
            periodType,
            periodStart,
            periodEnd,
            articles,
            topArticles,
            categories,
            tags
          );
          aiSummary = aiSummaryResult.content;
          aiSummaryFormat = aiSummaryResult.format;
          aiModel = GEMINI_API.TREND_MODEL;
          generatedAt = new Date();
        } catch (error) {
          logger.error({ err: error }, 'Failed to generate AI summary');
          // Save report even if AI generation fails
        }
      }

      // Save report
      let report;
      try {
        report = await this.prisma.trendReport.create({
          data: {
            periodType,
            periodStart,
            periodEnd,
            articleCount: articles.length,
            topArticles: JSON.parse(JSON.stringify(topArticles.slice(0, 10))),
            categories: JSON.parse(JSON.stringify(categories)),
            tags: JSON.parse(JSON.stringify(tags.slice(0, 30))),
            aiSummary,
            aiModel,
            promptVersion:
              aiSummaryFormat === 'json' ? PROMPT_VERSION : undefined,
            generatedAt,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Race condition: another process created the report
          logger.info(
            `Trend report race condition for ${periodType} starting ${periodStart.toISOString()}, fetching existing`
          );
          const conflictingReport = await this.prisma.trendReport.findUnique({
            where: {
              periodType_periodStart: {
                periodType,
                periodStart,
              },
            },
          });
          if (conflictingReport) {
            return conflictingReport.id;
          }
          // Should not reach here, but throw if findUnique returns null
          throw new Error(
            `Failed to recover from race condition: trend report not found after P2002 for ${periodType} starting ${periodStart.toISOString()}`
          );
        }
        throw error;
      }

      logger.info(
        `Trend report created: ${report.id} (${periodType}) with ${articles.length} articles`
      );
      return report.id;
    } catch (error) {
      logger.error(
        { err: error },
        `Failed to generate ${periodType} trend report`
      );
      throw new Error(`Failed to generate ${periodType} trend report`);
    }
  }

  /**
   * Get trend report for a specific period.
   */
  async getTrendReport(
    periodType: TrendPeriodType,
    periodStart: Date
  ): Promise<TrendReportData | null> {
    const report = await this.prisma.trendReport.findUnique({
      where: {
        periodType_periodStart: {
          periodType,
          periodStart,
        },
      },
    });

    if (!report) {
      return null;
    }

    return {
      periodType: report.periodType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      articleCount: report.articleCount,
      topArticles: report.topArticles as unknown as TopArticleInfo[],
      categories: report.categories as unknown as CategoryInfo[],
      tags: report.tags as unknown as TagInfo[],
      aiSummary: report.aiSummary ?? undefined,
      aiModel: report.aiModel ?? undefined,
      promptVersion: report.promptVersion ?? undefined,
      generatedAt: report.generatedAt ?? undefined,
    };
  }

  /**
   * Get the latest trend report.
   */
  async getLatestReport(
    periodType: TrendPeriodType
  ): Promise<TrendReportData | null> {
    const report = await this.prisma.trendReport.findFirst({
      where: { periodType },
      orderBy: { periodStart: 'desc' },
    });

    if (!report) {
      return null;
    }

    return {
      periodType: report.periodType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      articleCount: report.articleCount,
      topArticles: report.topArticles as unknown as TopArticleInfo[],
      categories: report.categories as unknown as CategoryInfo[],
      tags: report.tags as unknown as TagInfo[],
      aiSummary: report.aiSummary ?? undefined,
      aiModel: report.aiModel ?? undefined,
      promptVersion: report.promptVersion ?? undefined,
      generatedAt: report.generatedAt ?? undefined,
    };
  }

  /**
   * Get trend report list.
   */
  async getReportList(periodType: TrendPeriodType, limit: number = 10) {
    return this.prisma.trendReport.findMany({
      where: { periodType },
      orderBy: { periodStart: 'desc' },
      take: limit,
      select: {
        id: true,
        periodType: true,
        periodStart: true,
        periodEnd: true,
        articleCount: true,
        aiSummary: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get adjacent report dates for the specified date.
   */
  async getAdjacentReportDates(
    periodType: TrendPeriodType,
    currentPeriodStart: Date
  ): Promise<{ prevDate: Date | null; nextDate: Date | null }> {
    const prevReport = await this.prisma.trendReport.findFirst({
      where: {
        periodType,
        periodStart: { lt: currentPeriodStart },
      },
      orderBy: { periodStart: 'desc' },
      select: { periodStart: true },
    });

    const nextReport = await this.prisma.trendReport.findFirst({
      where: {
        periodType,
        periodStart: { gt: currentPeriodStart },
      },
      orderBy: { periodStart: 'asc' },
      select: { periodStart: true },
    });

    return {
      prevDate: prevReport?.periodStart ?? null,
      nextDate: nextReport?.periodStart ?? null,
    };
  }

  /**
   * Get the latest report date (for 404 responses).
   */
  async getLatestReportDate(periodType: TrendPeriodType): Promise<Date | null> {
    const report = await this.prisma.trendReport.findFirst({
      where: { periodType },
      orderBy: { periodStart: 'desc' },
      select: { periodStart: true },
    });
    return report?.periodStart ?? null;
  }
}
