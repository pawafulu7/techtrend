/**
 * Company source registry
 * Static mapping of source IDs to metadata
 *
 * Phase 1: Manual management
 * Phase 2: Replace with database queries
 */

export interface SourceRegistryEntry {
  id: string;
  name: string;
  siteUrl: string;
  slug?: string;
}

export const sourceRegistry: Record<string, SourceRegistryEntry> = {
  cookpad_tech_blog: {
    id: 'cookpad_tech_blog',
    name: 'Cookpad Tech Life',
    siteUrl: 'https://techlife.cookpad.com/rss',
  },
  cyberagent_tech_blog: {
    id: 'cyberagent_tech_blog',
    name: 'CyberAgent Developers Blog',
    siteUrl: 'https://developers.cyberagent.co.jp/blog/feed/',
  },
  dena_tech_blog: {
    id: 'dena_tech_blog',
    name: 'DeNA Engineering',
    siteUrl: 'https://engineering.dena.com/blog/index.xml',
  },
  freee_tech_blog: {
    id: 'freee_tech_blog',
    name: 'freee Developers Hub',
    siteUrl: 'https://developers.freee.co.jp/rss',
  },
  gmo_tech_blog: {
    id: 'gmo_tech_blog',
    name: 'GMO Developers',
    siteUrl: 'https://developers.gmo.jp/feed/',
  },
  hatena_tech_blog: {
    id: 'hatena_tech_blog',
    name: 'Hatena Developer Blog',
    siteUrl: 'https://developer.hatenastaff.com/rss',
  },
  lycorp_tech_blog: {
    id: 'lycorp_tech_blog',
    name: 'LY Corporation Tech Blog',
    siteUrl: 'https://techblog.lycorp.co.jp/ja/feed/index.xml',
  },
  mercari_tech_blog: {
    id: 'mercari_tech_blog',
    name: 'Mercari Engineering',
    siteUrl: 'https://engineering.mercari.com/blog/feed.xml',
  },
  moneyforward_tech_blog: {
    id: 'moneyforward_tech_blog',
    name: 'Money Forward Developers Blog',
    siteUrl: 'https://moneyforward-dev.jp/rss',
  },
  pepabo_tech_blog: {
    id: 'pepabo_tech_blog',
    name: 'ペパボテックブログ',
    siteUrl: 'https://tech.pepabo.com/feed/',
  },
  sansan_tech_blog: {
    id: 'sansan_tech_blog',
    name: 'Sansan Builders Box',
    siteUrl: 'https://buildersbox.corp-sansan.com/rss',
  },
  smarthr_tech_blog: {
    id: 'smarthr_tech_blog',
    name: 'SmartHR Tech Blog',
    siteUrl: 'https://tech.smarthr.jp/feed',
  },
  zozo_tech_blog: {
    id: 'zozo_tech_blog',
    name: 'ZOZO TECH BLOG',
    siteUrl: 'https://techblog.zozo.com/rss',
  },
};
