/**
 * Tests for notification configuration
 */

import { validateSlackWebhookUrl, loadNotificationConfig } from '../../../lib/notification/config';

describe('validateSlackWebhookUrl', () => {
  describe('valid URLs', () => {
    it('should accept valid Slack webhook URL', () => {
      expect(
        validateSlackWebhookUrl(
          'https://hooks.slack.com/services/TTEST0001/BTEST0001/testTokenXYZ123abc'
        )
      ).toBe(true);
    });

    it('should accept URL with various team/channel/token lengths', () => {
      expect(
        validateSlackWebhookUrl('https://hooks.slack.com/services/T1234/B5678/abcABC123')
      ).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(
        validateSlackWebhookUrl(
          '  https://hooks.slack.com/services/TTEST0002/BTEST0002/dummyTokenABC456xyz  '
        )
      ).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('should reject non-Slack URLs', () => {
      expect(validateSlackWebhookUrl('https://example.com/webhook')).toBe(false);
    });

    it('should reject HTTP (non-HTTPS) URLs', () => {
      expect(
        validateSlackWebhookUrl(
          'http://hooks.slack.com/services/TTEST0002/BTEST0002/dummyTokenABC456xyz'
        )
      ).toBe(false);
    });

    it('should reject URLs with wrong path structure', () => {
      expect(validateSlackWebhookUrl('https://hooks.slack.com/api/chat.postMessage')).toBe(false);
    });

    it('should reject URLs with missing parts', () => {
      expect(validateSlackWebhookUrl('https://hooks.slack.com/services/T00000000')).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(validateSlackWebhookUrl('')).toBe(false);
    });

    it('should reject whitespace-only strings', () => {
      expect(validateSlackWebhookUrl('   ')).toBe(false);
    });

    it('should reject URLs with lowercase team/channel IDs', () => {
      // Slack team/channel IDs are uppercase
      expect(
        validateSlackWebhookUrl('https://hooks.slack.com/services/t00000000/b00000000/token')
      ).toBe(false);
    });
  });
});

describe('loadNotificationConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('when notification is disabled', () => {
    it('should return disabled config when SLACK_NOTIFICATION_ENABLED is not set', () => {
      delete process.env.SLACK_NOTIFICATION_ENABLED;
      delete process.env.SLACK_WEBHOOK_URL;

      const config = loadNotificationConfig();
      expect(config).toEqual({ enabled: false, slackWebhookUrl: null });
    });

    it('should return disabled config when SLACK_NOTIFICATION_ENABLED is false', () => {
      process.env.SLACK_NOTIFICATION_ENABLED = 'false';
      process.env.SLACK_WEBHOOK_URL =
        'https://hooks.slack.com/services/TTEST0001/BTEST0001/testTokenXYZ123abc';

      const config = loadNotificationConfig();
      expect(config).toEqual({ enabled: false, slackWebhookUrl: null });
    });
  });

  describe('when notification is enabled', () => {
    it('should return disabled config when URL is not set', () => {
      process.env.SLACK_NOTIFICATION_ENABLED = 'true';
      delete process.env.SLACK_WEBHOOK_URL;

      const config = loadNotificationConfig();
      expect(config).toEqual({ enabled: false, slackWebhookUrl: null });
    });

    it('should return enabled config with valid URL', () => {
      process.env.SLACK_NOTIFICATION_ENABLED = 'true';
      process.env.SLACK_WEBHOOK_URL =
        'https://hooks.slack.com/services/TTEST0001/BTEST0001/testTokenXYZ123abc';

      const config = loadNotificationConfig();
      expect(config).toEqual({
        enabled: true,
        slackWebhookUrl:
          'https://hooks.slack.com/services/TTEST0001/BTEST0001/testTokenXYZ123abc',
      });
    });

    it('should return disabled config with invalid URL', () => {
      process.env.SLACK_NOTIFICATION_ENABLED = 'true';
      process.env.SLACK_WEBHOOK_URL = 'https://example.com/invalid';

      const config = loadNotificationConfig();
      expect(config).toEqual({ enabled: false, slackWebhookUrl: null });
    });

    it('should trim whitespace from URL', () => {
      process.env.SLACK_NOTIFICATION_ENABLED = 'true';
      process.env.SLACK_WEBHOOK_URL =
        '  https://hooks.slack.com/services/TTEST0002/BTEST0002/dummyTokenABC456xyz  ';

      const config = loadNotificationConfig();
      expect(config.slackWebhookUrl).toBe(
        'https://hooks.slack.com/services/TTEST0002/BTEST0002/dummyTokenABC456xyz'
      );
    });
  });
});
