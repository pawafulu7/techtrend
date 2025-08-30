/**
 * シンプルなWeb取得ユーティリティ
 */

import axios from 'axios';

export class WebFetcher {
  private timeout: number;
  private userAgent: string;

  constructor(timeout = 10000) {
    this.timeout = timeout;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  /**
   * URLからHTMLコンテンツを取得
   */
  async fetch(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });

      return response.data;
    } catch (_error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
        } else if (error.request) {
          throw new Error('ネットワークエラー: サーバーから応答がありません');
        }
      }
      throw error;
    }
  }
}