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
          text: expect.stringContaining('10 new articles'),
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: 'header' }),
            expect.objectContaining({ type: 'section' }),
            expect.objectContaining({ type: 'context' }),
          ]),
        })
      );
    });

    it('should include all stats in message', async () => {
      await notifier.send(samplePayload);

      const sentMessage = mockWebhook.send.mock.calls[0][0] as {
        blocks: Array<{ fields?: Array<{ text: string }> }>;
      };
      const sectionBlock = sentMessage.blocks.find(
        (b: { type: string }) => b.type === 'section'
      );

      expect(sectionBlock?.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('10') }), // newArticles
          expect.objectContaining({ text: expect.stringContaining('2') }), // updated
          expect.objectContaining({ text: expect.stringContaining('5') }), // duplicates
          expect.objectContaining({ text: expect.stringContaining('120') }), // duration
        ])
      );
    });

    it('should send notification even when newArticles is 0', async () => {
      const zeroPayload: NotificationPayload = {
        ...samplePayload,
        newArticles: 0,
      };

      await notifier.send(zeroPayload);

      expect(mockWebhook.send).toHaveBeenCalledTimes(1);
      expect(mockWebhook.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('No new articles'),
        })
      );
    });

    it('should use different emoji for zero articles', async () => {
      const zeroPayload: NotificationPayload = {
        ...samplePayload,
        newArticles: 0,
      };

      await notifier.send(zeroPayload);

      const sentMessage = mockWebhook.send.mock.calls[0][0] as {
        blocks: Array<{ text?: { text: string } }>;
      };
      const headerBlock = sentMessage.blocks.find(
        (b: { type: string }) => b.type === 'header'
      );

      expect(headerBlock?.text?.text).toContain(':white_check_mark:');
    });

    it('should use newspaper emoji for new articles', async () => {
      await notifier.send(samplePayload);

      const sentMessage = mockWebhook.send.mock.calls[0][0] as {
        blocks: Array<{ text?: { text: string } }>;
      };
      const headerBlock = sentMessage.blocks.find(
        (b: { type: string }) => b.type === 'header'
      );

      expect(headerBlock?.text?.text).toContain(':newspaper:');
    });
  });

  describe('retry mechanism', () => {
    it('should retry on failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockWebhook.send
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      await notifier.send(samplePayload);

      expect(mockWebhook.send).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('retry 1/1'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });

    it('should throw after exhausting retries', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockWebhook.send.mockRejectedValue(new Error('Persistent error'));

      await expect(notifier.send(samplePayload)).rejects.toThrow('Persistent error');
      expect(mockWebhook.send).toHaveBeenCalledTimes(2); // Initial + 1 retry

      consoleSpy.mockRestore();
    });

    it('should respect maxRetries setting', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const notifierWithMoreRetries = new SlackNotifier(mockWebhook, 2);

      mockWebhook.send.mockRejectedValue(new Error('Persistent error'));

      await expect(notifierWithMoreRetries.send(samplePayload)).rejects.toThrow();
      expect(mockWebhook.send).toHaveBeenCalledTimes(3); // Initial + 2 retries

      consoleSpy.mockRestore();
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
