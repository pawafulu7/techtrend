/**
 * Tests for SlackNotifier
 */

import { SlackNotifier } from '../../../lib/notification/slack-notifier';
import type { NotificationPayload, SlackWebhookClient } from '../../../lib/notification/types';

describe('SlackNotifier', () => {
  let mockWebhook: jest.Mocked<SlackWebhookClient>;
  let notifier: SlackNotifier;

  const samplePayload: NotificationPayload = {
    newArticles: 10,
    duplicates: 5,
    updated: 2,
    newArticleIds: ['id1', 'id2', 'id3'],
    articles: [
      { title: 'TypeScript Best Practices', url: 'https://example.com/ts', sourceName: 'Zenn' },
      { title: 'React 19 Features', url: 'https://example.com/react', sourceName: 'Qiita' },
      { title: 'Next.js 16 Guide', url: 'https://example.com/next', sourceName: 'Dev.to' },
    ],
    durationSeconds: 120,
  };

  beforeEach(() => {
    mockWebhook = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    notifier = new SlackNotifier(mockWebhook, 1);
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should send notification successfully', async () => {
      await notifier.send(samplePayload);

      expect(mockWebhook.send).toHaveBeenCalledTimes(1);
      expect(mockWebhook.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('10件の新着記事'),
        })
      );
    });

    it('should include article count in message', async () => {
      await notifier.send(samplePayload);

      const sentMessage = mockWebhook.send.mock.calls[0][0] as { text: string };
      expect(sentMessage.text).toContain('10件の新着記事');
    });

    it('should send notification even when newArticles is 0', async () => {
      const zeroPayload: NotificationPayload = {
        ...samplePayload,
        newArticles: 0,
        articles: [],
      };

      await notifier.send(zeroPayload);

      expect(mockWebhook.send).toHaveBeenCalledTimes(1);
      expect(mockWebhook.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('新着記事なし'),
        })
      );
    });

    it('should use different emoji for zero articles', async () => {
      const zeroPayload: NotificationPayload = {
        ...samplePayload,
        newArticles: 0,
        articles: [],
      };

      await notifier.send(zeroPayload);

      const sentMessage = mockWebhook.send.mock.calls[0][0] as { text: string };
      expect(sentMessage.text).toContain(':white_check_mark:');
    });

    it('should use newspaper emoji for new articles', async () => {
      await notifier.send(samplePayload);

      const sentMessage = mockWebhook.send.mock.calls[0][0] as { text: string };
      expect(sentMessage.text).toContain(':newspaper:');
    });

    it('should include article list in message', async () => {
      await notifier.send(samplePayload);

      const sentMessage = mockWebhook.send.mock.calls[0][0] as { text: string };
      expect(sentMessage.text).toContain('TypeScript Best Practices');
      expect(sentMessage.text).toContain('https://example.com/ts');
    });

    it('should escape special characters in titles', async () => {
      const payloadWithSpecialChars: NotificationPayload = {
        ...samplePayload,
        articles: [
          { title: 'Test <script> & "quotes"', url: 'https://example.com/test', sourceName: 'Test' },
        ],
      };

      await notifier.send(payloadWithSpecialChars);

      const sentMessage = mockWebhook.send.mock.calls[0][0] as { text: string };
      expect(sentMessage.text).toContain('&lt;script&gt;');
      expect(sentMessage.text).toContain('&amp;');
    });

    it('should not include article list when articles is empty', async () => {
      const emptyPayload: NotificationPayload = {
        ...samplePayload,
        newArticles: 0,
        articles: [],
      };

      await notifier.send(emptyPayload);

      const sentMessage = mockWebhook.send.mock.calls[0][0] as { text: string };
      // Should only contain header, no article links
      expect(sentMessage.text).not.toContain('https://example.com');
    });
  });

  describe('retry mechanism', () => {
    it('should retry on failure', async () => {
      mockWebhook.send
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      await notifier.send(samplePayload);

      expect(mockWebhook.send).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting retries', async () => {
      mockWebhook.send.mockRejectedValue(new Error('Persistent error'));

      await expect(notifier.send(samplePayload)).rejects.toThrow('Persistent error');
      expect(mockWebhook.send).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should respect maxRetries setting', async () => {
      const notifierWithMoreRetries = new SlackNotifier(mockWebhook, 2);

      mockWebhook.send.mockRejectedValue(new Error('Persistent error'));

      await expect(notifierWithMoreRetries.send(samplePayload)).rejects.toThrow();
      expect(mockWebhook.send).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should handle non-Error exceptions', async () => {
      mockWebhook.send.mockRejectedValue('String error');

      await expect(notifier.send(samplePayload)).rejects.toThrow('String error');
    });
  });

  describe('fromUrl factory', () => {
    it('should create notifier from URL', () => {
      // We can't easily test the actual IncomingWebhook creation,
      // but we can verify the factory method exists and returns a SlackNotifier
      const fromUrlNotifier = SlackNotifier.fromUrl(
        'https://hooks.slack.com/services/TTEST0001/BTEST0001/testTokenXYZ123abc'
      );
      expect(fromUrlNotifier).toBeInstanceOf(SlackNotifier);
    });
  });
});
