import axios from 'axios';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';

interface QiitaItem {
  id: string;
  title: string;
  url: string;
  body: string;
  rendered_body: string;
  created_at: string;
  updated_at: string;
  tags: Array<{
    name: string;
    versions: string[];
  }>;
  user: {
    id: string;
    name: string;
    profile_image_url: string;
  };
  likes_count: number;
  stocks_count: number;
  comments_count: number;
}

export class QiitaFetcher extends BaseFetcher {
  private apiUrl = 'https://qiita.com/api/v2/items';
  private perPage = 100;

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      const response = await this.retry(() => 
        axios.get<QiitaItem[]>(this.apiUrl, {
          params: {
            page: 1,
            per_page: this.perPage,
            query: 'created:>1week',
          },
          headers: {
            'Accept': 'application/json',
          },
        })
      );

      for (const item of response.data) {
        try {
          const article: CreateArticleInput = {
            title: item.title,
            url: item.url,
            summary: this.extractSummary(item.body),
            content: item.rendered_body,
            publishedAt: new Date(item.created_at),
            sourceId: this.source.id,
            tagNames: item.tags.map(tag => tag.name),
          };

          // Extract thumbnail from user profile or content
          const thumbnail = this.extractThumbnailFromContent(item.rendered_body) || item.user.profile_image_url;
          if (thumbnail) {
            article.thumbnail = thumbnail;
          }

          articles.push(article);
        } catch (error) {
          errors.push(new Error(`Failed to parse Qiita item ${item.id}: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        errors.push(new Error(`Qiita API error: ${error.response?.status} ${error.response?.statusText}`));
      } else {
        errors.push(new Error(`Failed to fetch from Qiita: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    return { articles, errors };
  }

  private extractSummary(body: string): string {
    // Remove code blocks and markdown formatting
    const cleaned = body
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/#+\s/g, '') // Remove headers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/[*_~]/g, '') // Remove emphasis
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();

    return cleaned.substring(0, 200) + (cleaned.length > 200 ? '...' : '');
  }

  private extractThumbnailFromContent(html: string): string | null {
    // First try to find an image in the content
    const imgMatch = html.match(/<img[^>]*src="([^"]+)"/);
    if (imgMatch && imgMatch[1]) {
      // Filter out small images or icons
      if (!imgMatch[1].includes('emoji') && !imgMatch[1].includes('icon')) {
        return imgMatch[1];
      }
    }
    return null;
  }
}