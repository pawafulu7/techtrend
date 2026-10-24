import {
  BarChart3,
  Cog,
  Database,
  FileText,
  Gauge,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavItem {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const adminNavigation: NavSection[] = [
  {
    label: '概要',
    items: [{ title: 'ダッシュボード', href: '/admin', icon: LayoutDashboard }],
  },
  {
    label: '管理',
    items: [
      { title: 'ユーザー', href: '/admin/users', icon: Users },
      { title: '記事管理', href: '/admin/articles', icon: FileText },
      { title: '問い合わせ', href: '/admin/inquiries', icon: Inbox },
      { title: 'SNS投稿', href: '/admin/social-posts', icon: MessageSquare },
      // ソースの一覧はサイトの画面（ヘッダー付き）。管理画面の外へ移る
      { title: 'ソース', href: '/sources', icon: Database },
    ],
  },
  {
    // 旧 /stats と /dashboard/* をここにまとめた（Issue #709）
    label: '集計・運用',
    items: [
      { title: '記事の統計', href: '/admin/stats', icon: BarChart3 },
      { title: 'ジョブ', href: '/admin/jobs', icon: Cog },
      { title: 'パフォーマンス', href: '/admin/performance', icon: Gauge },
    ],
  },
];
