'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui-v2/badge-v2';
import { Button } from '@/components/ui-v2/button-v2';
import type { GateAllowlistEntry } from '@/lib/auth/site-gate/admin-types';

interface GateEmailTableProps {
  rows: GateAllowlistEntry[];
  onRequestDelete: (row: GateAllowlistEntry, opener: HTMLElement) => void;
}

function formatAddedDate(createdAt: string | null): string {
  return createdAt === null ? 'なし' : new Date(createdAt).toLocaleDateString('ja-JP');
}

export function GateEmailTable({ rows, onRequestDelete }: GateEmailTableProps) {
  return (
    // 狭い幅（390px など）では追加日の列を隠し、削除ボタンが横スクロールの先に隠れないようにする
    <div className="@container rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>アドレス</TableHead>
            <TableHead className="hidden @md:table-cell">追加日</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
                許可しているアドレスはありません
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => {
            // 固定のアドレスと、今使っているアカウントは消せない（締め出しを防ぐ）
            const deletable = row.id !== null && !row.isFixed && !row.isCurrentGateAccount;
            return (
              <TableRow key={row.id ?? `fixed:${row.email}`} data-testid="gate-email-row">
                <TableCell className="whitespace-normal">
                  <div className="font-medium break-all">{row.email}</div>
                  {(row.isFixed || row.isCurrentGateAccount) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {row.isFixed && <Badge variant="info">設定で固定</Badge>}
                      {row.isCurrentGateAccount && (
                        <span className="text-muted-foreground text-xs">
                          （今使っているアカウント）
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hidden @md:table-cell">
                  {formatAddedDate(row.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {deletable ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => onRequestDelete(row, event.currentTarget)}
                      aria-label={`${row.email} を削除`}
                      className="text-(--tt-color-negative) hover:opacity-80"
                    >
                      削除
                    </Button>
                  ) : (
                    <>
                      <span aria-hidden="true" className="text-muted-foreground">
                        —
                      </span>
                      <span className="sr-only">削除できません</span>
                    </>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
