import { BaseFetcher } from './base';
import { CreateArticleInput } from '@/types/article';

interface ConnpassEvent {
  event_id: number;
  title: string;
  catch: string;
  description: string;
  event_url: string;
  started_at: string;
  ended_at: string;
  limit: number;
  hash_tag: string;
  event_type: string;
  accepted: number;
  waiting: number;
  updated_at: string;
  owner_id: number;
  owner_nickname: string;
  owner_display_name: string;
  place: string;
  address: string;
  lat: string;
  lon: string;
  series?: {
    id: number;
    title: string;
    url: string;
  };
}

interface ConnpassApiResponse {
  results_returned: number;
  results_available: number;
  results_start: number;
  events: ConnpassEvent[];
}

export class ConnpassFetcher extends BaseFetcher {
  
  private apiUrl = 'https://connpass.com/api/v1/event/';
  private techKeywords = [
    'プログラミング', 'エンジニア', '開発', 'JavaScript', 'TypeScript',
    'React', 'Vue', 'Angular', 'Node.js', 'Python', 'Ruby', 'Go',
    'Rust', 'Java', 'Kotlin', 'Swift', 'Flutter', 'AWS', 'GCP', 'Azure',
    'Docker', 'Kubernetes', 'DevOps', 'AI', '機械学習', 'データサイエンス',
    'Web', 'iOS', 'Android', 'インフラ', 'セキュリティ', 'アーキテクチャ'
  ];

  async fetch(): Promise<{ articles: CreateArticleInput[]; errors: Error[] }> {
    console.log('[connpass] 技術イベント情報を取得します...');
    
    const allEvents: ConnpassEvent[] = [];
    const eventsPerKeyword = 20;
    const keywordsToSearch = this.techKeywords.slice(0, 10); // 最初の10キーワードを使用
    
    for (const keyword of keywordsToSearch) {
      try {
        console.log(`[connpass] キーワード「${keyword}」で検索中...`);
        
        const params = new URLSearchParams({
          keyword: keyword,
          order: '2', // 更新日時順
          count: eventsPerKeyword.toString(),
        });
        
        const response = await fetch(`${this.apiUrl}?${params}`);
        
        if (!response.ok) {
          console.error(`[connpass] APIエラー: ${response.status}`);
          continue;
        }
        
        const data: ConnpassApiResponse = await response.json();
        
        if (data.events && data.events.length > 0) {
          allEvents.push(...data.events);
          console.log(`[connpass] ${data.events.length}件のイベントを取得`);
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`[connpass] キーワード「${keyword}」の取得エラー:`, error);
      }
    }
    
    // 重複を除去
    const uniqueEvents = Array.from(
      new Map(allEvents.map(event => [event.event_id, event])).values()
    );
    
    console.log(`[connpass] 合計${uniqueEvents.length}件のイベントを取得しました`);
    
    // イベントを記事形式に変換
    const articles = uniqueEvents.map(event => this.eventToArticle(event));
    
    return {
      articles,
      errors: []
    };
  }
  
  private eventToArticle(event: ConnpassEvent): CreateArticleInput {
    // イベントの説明文を要約として使用
    const summary = this.createEventSummary(event);
    
    // タグを生成
    const tags: string[] = [];
    if (event.hash_tag) {
      tags.push(...event.hash_tag.split(/[,\s]+/).filter(tag => tag.length > 0));
    }
    if (event.series?.title) {
      tags.push(event.series.title);
    }
    
    return {
      title: event.title,
      url: event.event_url,
      content: event.description || event.catch || '',
      summary,
      publishedAt: new Date(event.started_at),
      sourceId: this.source.id,
      tagNames: tags
    };
  }
  
  private createEventSummary(event: ConnpassEvent): string {
    const parts: string[] = [];
    
    // 日時情報
    const startDate = new Date(event.started_at);
    const dateStr = startDate.toLocaleDateString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
    parts.push(`開催日時: ${dateStr}`);
    
    // 場所情報
    if (event.place) {
      parts.push(`場所: ${event.place}`);
    } else if (event.event_type === 'online') {
      parts.push('オンライン開催');
    }
    
    // 参加者情報
    if (event.limit) {
      parts.push(`定員: ${event.limit}名`);
      if (event.accepted > 0) {
        parts.push(`参加者: ${event.accepted}名`);
      }
    }
    
    // キャッチコピー
    if (event.catch && event.catch.length > 0) {
      parts.push(event.catch);
    }
    
    return parts.join(' / ');
  }
}