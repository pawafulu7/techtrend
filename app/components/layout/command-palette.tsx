'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  FileText,
  Flame,
  GraduationCap,
  Hash,
  Heart,
  History,
  Home,
  Mail,
  Newspaper,
  Search,
  Shield,
  Sparkles,
  User,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui-v2/button-v2';
import { authClient } from '@/lib/auth/auth-client';
import { useShowAiSearch } from './primary-nav';

interface PaletteContextValue {
  open: () => void;
}

const PaletteContext = createContext<PaletteContextValue | null>(null);

function useCommandPalette(): PaletteContextValue {
  const value = useContext(PaletteContext);
  if (!value) {
    throw new Error('useCommandPalette must be used in CommandPaletteProvider');
  }
  return value;
}

interface PalettePage {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 英語や別名でも探せるようにする */
  keywords?: string[];
}

/** 入力欄・文字を書ける要素にフォーカスがあるか（そこでの ⌘K は奪わない） */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * コマンドパレット（Issue #704）。⌘K / Ctrl+K で開き、ページへの移動と記事のキーワード検索ができる。
 *
 * - 入力欄にフォーカスがあるときの ⌘K は奪わない（その欄での操作を優先する）
 * - Esc で閉じ、開く前にフォーカスがあった場所へ戻す。ショートカットで開くと Radix は戻し先（トリガー）を
 *   持たず body に落とすので、開いたときの要素を覚えて戻す
 * - ⌘⇧K（AI 検索の入力欄へ移る）とは別のキー
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const showAiSearch = useShowAiSearch();
  const isLoggedIn = !!session?.user;
  const isAdmin = session?.user?.role === 'admin';

  const returnFocusRef = useRef<HTMLElement | null>(null);
  // ⌘K の listener から開いているかを見る（listener は一度だけ登録するので state を直接は読めない）
  const isOpenRef = useRef(false);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const open = useCallback(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setIsOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 修飾キーを先に見る（自動入力などは key の無い keydown を送ることがある）。
      // 開いている間は何もしない（戻し先をダイアログの中の要素で上書きしない）
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.shiftKey ||
        event.altKey ||
        event.key?.toLowerCase() !== 'k' ||
        event.isComposing ||
        isOpenRef.current ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      open();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const pages = useMemo<PalettePage[]>(
    () => [
      {
        href: '/',
        label: 'ホーム',
        icon: Home,
        keywords: ['home', '記事一覧'],
      },
      {
        href: '/reader',
        label: 'リーダー',
        icon: BookOpen,
        keywords: ['reader'],
      },
      {
        href: '/digest',
        label: 'ダイジェスト',
        icon: Newspaper,
        keywords: ['digest'],
      },
      {
        href: '/trends',
        label: 'トレンド',
        icon: BarChart3,
        keywords: ['trends'],
      },
      {
        href: '/popular',
        label: '人気',
        icon: Flame,
        keywords: ['popular', 'ランキング'],
      },
      { href: '/tags', label: 'タグ', icon: Hash, keywords: ['tags'] },
      {
        href: '/papers',
        label: '論文',
        icon: GraduationCap,
        keywords: ['papers', 'arxiv'],
      },
      {
        href: '/changelog',
        label: 'AIエージェント更新情報',
        icon: FileText,
        keywords: ['changelog', 'リリースノート'],
      },
      ...(showAiSearch
        ? [
            {
              href: '/search/agent',
              label: 'AI検索',
              icon: Sparkles,
              keywords: ['ai', 'search'],
            },
          ]
        : []),
      ...(isLoggedIn
        ? [
            {
              href: '/favorites',
              label: 'お気に入り',
              icon: Heart,
              keywords: ['favorites'],
            },
            {
              href: '/history',
              label: '閲覧履歴・読書分析',
              icon: History,
              keywords: ['history', 'analytics', '分析'],
            },
            {
              href: '/profile',
              label: 'プロフィール',
              icon: User,
              keywords: ['profile', '設定'],
            },
          ]
        : []),
      ...(isAdmin
        ? [
            {
              href: '/admin',
              label: '管理画面',
              icon: Shield,
              keywords: ['admin'],
            },
          ]
        : []),
      {
        href: '/contact',
        label: 'お問い合わせ・要望',
        icon: Mail,
        keywords: ['contact'],
      },
    ],
    [showAiSearch, isLoggedIn, isAdmin]
  );

  const go = (href: string) => {
    setIsOpen(false);
    setQuery('');
    router.push(href);
  };

  const trimmed = query.trim();
  const contextValue = useMemo(() => ({ open }), [open]);

  return (
    <PaletteContext.Provider value={contextValue}>
      {children}
      <Dialog
        open={isOpen}
        onOpenChange={(next) => {
          setIsOpen(next);
          if (!next) setQuery('');
        }}
      >
        <DialogContent
          className="top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            const target = returnFocusRef.current;
            returnFocusRef.current = null;
            // ページを移ったときは、前のページの要素が残っていなければ既定（body）のままにする
            if (target && target.isConnected && target !== document.body) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          <DialogTitle className="sr-only">
            ページを開く・記事を検索
          </DialogTitle>
          <DialogDescription className="sr-only">
            ページの名前か、記事を探すキーワードを入力してください。
          </DialogDescription>
          <Command
            label="ページを開く・記事を検索"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-(--tt-color-text-muted) [&_[cmdk-item]]:gap-2 [&_[cmdk-item]]:px-2 [&_[cmdk-item]_svg]:size-4 [&_[cmdk-item]_svg]:shrink-0 [&_[cmdk-item]_svg]:text-(--tt-color-text-muted)"
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="ページの名前、または記事のキーワード"
            />
            <CommandList>
              <CommandEmpty>一致するページがありません</CommandEmpty>
              <CommandGroup heading="ページ">
                {pages.map((page) => {
                  const Icon = page.icon;
                  return (
                    <CommandItem
                      key={page.href}
                      value={page.label}
                      keywords={page.keywords}
                      onSelect={() => go(page.href)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{page.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {/* 記事の検索はページの後に置く。入力がページの名前に当たるときは Enter でそのページを開き、
                  当たらないときはこれだけが残るので Enter で検索する */}
              {trimmed && (
                <CommandGroup heading="記事を検索" forceMount>
                  <CommandItem
                    value={`search ${trimmed}`}
                    forceMount
                    onSelect={() =>
                      go(`/?search=${encodeURIComponent(trimmed)}`)
                    }
                  >
                    <Search aria-hidden="true" />
                    <span className="truncate">「{trimmed}」で記事を検索</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </PaletteContext.Provider>
  );
}

/**
 * ヘッダーのコマンドパレットの入口。デスクトップは「検索」とキーの案内、モバイルは虫眼鏡のアイコンだけ
 */
export function CommandPaletteTrigger({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { open } = useCommandPalette();
  // キーの案内は OS が分かってから出す（サーバー描画では分からないので、決め打ちで出すと切り替わって見える）
  const [isMac, setIsMac] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator はブラウザでだけ読める（サーバー描画とそろえるため effect で）
    setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
  }, []);

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-11 w-11"
        onClick={open}
        aria-label="ページを開く・記事を検索"
        data-testid="command-palette-trigger"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={open}
      aria-keyshortcuts={
        isMac === null ? undefined : isMac ? 'Meta+K' : 'Control+K'
      }
      data-testid="command-palette-trigger"
      className="gap-2 text-(--tt-color-text-muted)"
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span>検索</span>
      {isMac !== null && (
        <kbd className="rounded-sm border border-(--tt-color-border) px-1.5 font-sans text-[11px] leading-5 text-(--tt-color-text-muted)">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      )}
    </Button>
  );
}
