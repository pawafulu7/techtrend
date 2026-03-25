import { FileText, LayoutDashboard, Users } from 'lucide-react';
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
    ],
  },
];
