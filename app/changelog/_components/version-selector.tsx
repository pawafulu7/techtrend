'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChangelogVersion } from '@/lib/changelog/types';

interface VersionSelectorProps {
  versions: ChangelogVersion[];
  currentVersion: string;
  onVersionChange: (version: string) => void;
}

export function VersionSelector({
  versions,
  currentVersion,
  onVersionChange,
}: VersionSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor="version-select"
        className="text-sm font-medium whitespace-nowrap text-[var(--tt-color-text-muted)]"
      >
        バージョン
      </label>
      <Select value={currentVersion} onValueChange={onVersionChange}>
        <SelectTrigger
          id="version-select"
          className="w-[220px] bg-[var(--tt-color-surface)]"
        >
          <SelectValue placeholder="バージョンを選択" />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.id} value={v.version}>
              <span className="flex items-center gap-2">
                <span className="font-medium">v{v.version}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  （{v.entryCount}件）
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
