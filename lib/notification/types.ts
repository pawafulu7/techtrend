/**
 * Notification module types
 *
 * Defines interfaces for the notification system, supporting
 * multiple notification channels (Slack, email, etc.)
 */

/**
 * Article information for notification display
 */
export interface ArticleInfo {
  /** Article title */
  title: string;
  /** Article URL */
  url: string;
  /** Source name (e.g., "Zenn", "Qiita") */
  sourceName: string;
}

/**
 * Payload sent to notification services after article collection
 */
export interface NotificationPayload {
  /** Number of newly collected articles */
  newArticles: number;
  /** Number of duplicate articles skipped */
  duplicates: number;
  /** Number of articles updated */
  updated: number;
  /** IDs of newly collected articles */
  newArticleIds: string[];
  /** Detailed information about new articles */
  articles: ArticleInfo[];
  /** Duration of the collection process in seconds */
  durationSeconds: number;
}

/**
 * Common interface for all notification implementations
 */
export interface Notifier {
  /**
   * Send a notification with the given payload
   * @param payload - Collection result data
   * @throws Error if notification fails after retries
   */
  send(payload: NotificationPayload): Promise<void>;
}

/**
 * Slack webhook client interface for dependency injection
 * Matches the IncomingWebhook.send() signature
 */
export interface SlackWebhookClient {
  send(message: unknown): Promise<unknown>;
}
