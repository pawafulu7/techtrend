/**
 * Tests for notification factory
 */

import { createNotifierFromEnv } from '../../../lib/notification/notification-factory';
import { SlackNotifier } from '../../../lib/notification/slack-notifier';
import { resetEnvCache } from '@/lib/config/env';

describe('createNotifierFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    resetEnvCache();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  it('should return null when notification is disabled', () => {
    process.env.SLACK_NOTIFICATION_ENABLED = 'false';

    const notifier = createNotifierFromEnv();
    expect(notifier).toBeNull();
  });

  it('should return null when URL is not configured', () => {
    process.env.SLACK_NOTIFICATION_ENABLED = 'true';
    delete process.env.SLACK_WEBHOOK_URL;

    const notifier = createNotifierFromEnv();
    expect(notifier).toBeNull();
  });

  it('should return SlackNotifier when properly configured', () => {
    process.env.SLACK_NOTIFICATION_ENABLED = 'true';
    process.env.SLACK_WEBHOOK_URL =
      'https://hooks.slack.com/services/TTEST0001/BTEST0001/testTokenXYZ123abc';

    const notifier = createNotifierFromEnv();
    expect(notifier).toBeInstanceOf(SlackNotifier);
  });

  it('should return null when URL is invalid', () => {
    process.env.SLACK_NOTIFICATION_ENABLED = 'true';
    process.env.SLACK_WEBHOOK_URL = 'https://invalid-url.com';

    const notifier = createNotifierFromEnv();
    expect(notifier).toBeNull();
  });
});
