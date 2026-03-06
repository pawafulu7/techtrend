import { LayoutDashboard, Users } from 'lucide-react';
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
    items: [{ title: 'Dashboard', href: '/admin', icon: LayoutDashboard }],
  },
  {
    label: '管理',
    items: [{ title: 'Users', href: '/admin/users', icon: Users }],
  },
];
