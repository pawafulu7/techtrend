/**
 * Slack notification implementation
 *
 * Sends article collection reports to Slack via Incoming Webhook.
 * Features:
 * - Retry mechanism with exponential backoff
 * - Structured message formatting using Block Kit
 * - Dependency injection for testability
 */

import { IncomingWebhook } from '@slack/webhook';
import logger from '@/lib/logger';
import type { Notifier, NotificationPayload, SlackWebhookClient } from './types';

export class SlackNotifier implements Notifier {
  private webhook: SlackWebhookClient;
  private maxRetries: number;

  /**
   * Creates a SlackNotifier with a custom webhook client (for testing)
   *
   * @param webhook - Slack webhook client instance
   * @param maxRetries - Maximum retry attempts (default: 1)
   */
  constructor(webhook: SlackWebhookClient, maxRetries = 1) {
    this.webhook = webhook;
    this.maxRetries = maxRetries;
  }

  /**
   * Creates a SlackNotifier from a webhook URL
   *
   * @param webhookUrl - Slack Incoming Webhook URL
   * @param maxRetries - Maximum retry attempts (default: 1)
   * @returns Configured SlackNotifier instance
   */
  static fromUrl(webhookUrl: string, maxRetries = 1): SlackNotifier {
    return new SlackNotifier(new IncomingWebhook(webhookUrl), maxRetries);
  }

  /**
   * Sends a notification to Slack
   *
   * Implements retry with linear backoff on failure.
   * Reports are sent even when newArticles is 0 (operational monitoring).
   *
   * @param payload - Collection result data
   * @throws Error if all retry attempts fail
   */
  async send(payload: NotificationPayload): Promise<void> {
    const message = this.buildMessage(payload);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.webhook.send(message);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          const delayMs = 1000 * (attempt + 1); // 1s, 2s backoff
          logger.warn(
            { attempt: attempt + 1, maxRetries: this.maxRetries, error: lastError.message },
            'Slack notification failed, retrying'
          );
          await this.delay(delayMs);
        }
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /** Maximum number of articles to display in notification */
  private static readonly MAX_DISPLAY_ARTICLES = 50;

  /**
   * Builds Slack Block Kit message from payload
   */
  private buildMessage(payload: NotificationPayload): object {
    const { newArticles, articles } = payload;

    // Choose emoji based on results
    const emoji = newArticles > 0 ? ':newspaper:' : ':white_check_mark:';
    const statusText =
      newArticles > 0 ? `${newArticles}件の新着記事` : '新着記事なし';

    const blocks: object[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${statusText}`,
          emoji: true,
        },
      },
    ];

    // Add article list if there are new articles
    if (articles && articles.length > 0) {
      const displayArticles = articles.slice(
        0,
        SlackNotifier.MAX_DISPLAY_ARTICLES
      );
      const articleListText = displayArticles
        .map((a) => `• <${a.url}|${this.escapeSlackText(a.title)}>`)
        .join('\n');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: articleListText,
        },
      });

      // Add truncation notice if there are more articles
      if (articles.length > SlackNotifier.MAX_DISPLAY_ARTICLES) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `他 ${articles.length - SlackNotifier.MAX_DISPLAY_ARTICLES}件`,
            },
          ],
        });
      }
    }

    return {
      text: `[TechTrend] ${statusText}`,
      blocks,
    };
  }

  /**
   * Escapes special characters for Slack mrkdwn format
   */
  private escapeSlackText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Delays execution for the specified duration
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
