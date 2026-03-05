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
    label: 'Overview',
    items: [{ title: 'Dashboard', href: '/admin', icon: LayoutDashboard }],
  },
  {
    label: 'Management',
    items: [{ title: 'Users', href: '/admin/users', icon: Users }],
  },
];
