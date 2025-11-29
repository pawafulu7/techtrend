/**
 * Tests for notification factory
 */

import { createNotifierFromEnv } from '../../../lib/notification/notification-factory';
import { SlackNotifier } from '../../../lib/notification/slack-notifier';

describe('createNotifierFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
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
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    process.env.SLACK_NOTIFICATION_ENABLED = 'true';
    process.env.SLACK_WEBHOOK_URL = 'https://invalid-url.com';

    const notifier = createNotifierFromEnv();
    expect(notifier).toBeNull();

    consoleSpy.mockRestore();
  });
});
