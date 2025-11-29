/**
 * Notification module
 *
 * Provides notification capabilities for the TechTrend article collection system.
 * Currently supports Slack notifications via Incoming Webhook.
 *
 * @example
 * ```typescript
 * import { createNotifierFromEnv } from '@/lib/notification';
 *
 * const notifier = createNotifierFromEnv();
 * if (notifier) {
 *   await notifier.send({
 *     newArticles: 10,
 *     duplicates: 3,
 *     updated: 2,
 *     newArticleIds: ['id1', 'id2'],
 *     durationSeconds: 150
 *   });
 * }
 * ```
 */

export * from './types';
export * from './config';
export * from './slack-notifier';
export * from './notification-factory';
