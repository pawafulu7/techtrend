/**
 * Notification configuration management
 *
 * Handles loading and validation of notification settings from environment variables.
 */

import logger from '@/lib/logger';
import { env } from '@/lib/config/env';

export interface NotificationConfig {
  /** Whether Slack notification is enabled */
  enabled: boolean;
  /** Slack Incoming Webhook URL (null if not configured) */
  slackWebhookUrl: string | null;
}

/**
 * Validates Slack Incoming Webhook URL format
 *
 * Expected format: https://hooks.slack.com/services/TXXXXX/BXXXXX/xxxxxxxx
 *
 * @param url - URL to validate
 * @returns true if URL is valid Slack webhook format
 */
export function validateSlackWebhookUrl(url: string): boolean {
  const trimmed = url.trim();
  // Slack webhook URL pattern: https://hooks.slack.com/services/{team}/{channel}/{token}
  const pattern =
    /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/;
  return pattern.test(trimmed);
}

/**
 * Loads notification configuration from environment variables
 *
 * Environment variables:
 * - SLACK_NOTIFICATION_ENABLED: "true" to enable (default: false)
 * - SLACK_WEBHOOK_URL: Slack Incoming Webhook URL
 *
 * If SLACK_WEBHOOK_URL is set but invalid, notification is disabled with a warning.
 *
 * @returns Validated notification configuration
 */
export function loadNotificationConfig(): NotificationConfig {
  const enabled = env.SLACK_NOTIFICATION_ENABLED === 'true';
  const slackWebhookUrl = env.SLACK_WEBHOOK_URL?.trim() || null;

  // If disabled, return early
  if (!enabled) {
    return { enabled: false, slackWebhookUrl: null };
  }

  // If enabled but no URL, disable silently (URL not configured yet)
  if (!slackWebhookUrl) {
    return { enabled: false, slackWebhookUrl: null };
  }

  // Validate URL format
  if (!validateSlackWebhookUrl(slackWebhookUrl)) {
    logger.warn(
      'SLACK_WEBHOOK_URL format is invalid. Notification is disabled. Expected format: https://hooks.slack.com/services/TXXXXX/BXXXXX/xxxxxxxx'
    );
    return { enabled: false, slackWebhookUrl: null };
  }

  return { enabled, slackWebhookUrl };
}
