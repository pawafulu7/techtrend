/**
 * Notification factory
 *
 * Creates appropriate notifier instances based on environment configuration.
 * Centralizes environment variable handling for clean separation of concerns.
 */

import { SlackNotifier } from './slack-notifier';
import { loadNotificationConfig } from './config';
import type { Notifier } from './types';

/**
 * Creates a Notifier based on environment configuration
 *
 * Returns null if notification is disabled or not configured,
 * allowing callers to skip notification without error handling.
 *
 * @returns Configured Notifier instance or null
 */
export function createNotifierFromEnv(): Notifier | null {
  const config = loadNotificationConfig();

  if (!config.enabled || !config.slackWebhookUrl) {
    return null;
  }

  return SlackNotifier.fromUrl(config.slackWebhookUrl);
}
