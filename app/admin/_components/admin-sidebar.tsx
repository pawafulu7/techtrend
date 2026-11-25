'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { adminNavigation } from '../_config/navigation';
import { Shield } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  gateAccessRequestsQueryOptions,
  isGateAccessRequestsAuthFailure,
} from '@/lib/auth/site-gate/admin-request-query';

const GATE_ACCESS_HREF = '/admin/gate-access';

/**
 * 対応待ちの利用の申請の件数（メニューの「サイトに入れるアカウント」の横に出す）。
 * 画面の一覧と同じキーで読むので、許可・却下するとここも変わる。読めないときは何も出さない。
 * 管理画面を開いたままでも、1 分ごとに取り直す（lib/auth/site-gate/admin-request-query.ts）
 */
function usePendingGateRequestCount(): number {
  // 取得の設定は画面の一覧と共通（同じキーでは、先に取得を始めたこちらの設定が使われるため）
  const { data, error } = useQuery(gateAccessRequestsQueryOptions);
  // 取り直しでログイン切れ・権限なし（401・403）が分かったら、前に読めた件数を出し続けない
  if (isGateAccessRequestsAuthFailure(error)) return 0;
  return data?.requests.length ?? 0;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const pendingGateRequests = usePendingGateRequestCount();

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <span className="text-lg font-semibold">TechTrend Admin</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {adminNavigation.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)}>
                    <Link href={item.href} prefetch={false}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {/* 読み上げ用の件数はリンクの中に置く（Tab でリンクに来たときに読まれるように） */}
                      {item.href === GATE_ACCESS_HREF && pendingGateRequests > 0 && (
                        <span className="sr-only">{`（対応待ちの申請 ${pendingGateRequests} 件）`}</span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                  {item.href === GATE_ACCESS_HREF && pendingGateRequests > 0 && (
                    <SidebarMenuBadge
                      aria-hidden="true"
                      className="bg-(--tt-color-primary) text-(--tt-color-on-primary) peer-hover/menu-button:text-(--tt-color-on-primary) peer-data-[active=true]/menu-button:text-(--tt-color-on-primary)"
                      data-testid="gate-request-nav-count"
                    >
                      {pendingGateRequests}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
