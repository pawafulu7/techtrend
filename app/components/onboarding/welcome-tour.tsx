'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { X, Sparkles } from 'lucide-react';
import type { Step, CallBackProps } from 'react-joyride';

// react-joyrideをdynamic importで読み込み（SSR対応）
const Joyride = dynamic(() => import('react-joyride'), {
  ssr: false,
});

interface WelcomeTourProps {
  onComplete?: () => void;
}

export function WelcomeTour({ onComplete }: WelcomeTourProps) {
  const [run, setRun] = useState(false);
  const [showInitialDialog, setShowInitialDialog] = useState(false);

  // LocalStorageからツアー完了状態を確認
  useEffect(() => {
    const tourCompleted = localStorage.getItem('techtrend-tour-completed');
    if (!tourCompleted) {
      // 初回訪問時は少し遅延してから表示
      const timer = setTimeout(() => {
        setShowInitialDialog(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // ツアーのステップ定義
  const steps: Step[] = [
    {
      target: '.nav-item:first-child',
      content: '最新の技術記事をAI要約付きで閲覧できます。毎時更新される新しい記事をチェックしましょう。',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '.nav-item:nth-child(2)',
      content: '人気の記事をチェックして、今話題の技術トレンドを把握しましょう。',
      placement: 'bottom',
    },
    {
      target: '.nav-item:nth-child(3)',
      content: '信頼できる技術情報源から記事を収集しています。各ソースの記事数も確認できます。',
      placement: 'bottom',
    },
    {
      target: '[class*="NavDropdown"]',
      content: 'その他の機能はこちらから。読書リスト、お気に入り、統計情報などにアクセスできます。',
      placement: 'bottom',
    },
    {
      target: 'input[type="search"]',
      content: 'キーワードで記事を検索できます。タグやソースでの絞り込みも可能です。',
      placement: 'bottom',
    },
  ];

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses = ['finished', 'skipped'];

    if (finishedStatuses.includes(status)) {
      // ツアー完了をLocalStorageに保存
      localStorage.setItem('techtrend-tour-completed', 'true');
      setRun(false);
      onComplete?.();
    }
  };

  const startTour = () => {
    setShowInitialDialog(false);
    setRun(true);
  };

  const skipTour = () => {
    setShowInitialDialog(false);
    localStorage.setItem('techtrend-tour-completed', 'true');
  };

  // 初回訪問ダイアログ
  if (showInitialDialog) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-background border rounded-lg shadow-lg p-6 max-w-md w-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">TechTrendへようこそ！</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={skipTour}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-muted-foreground mb-6">
            TechTrendは最新の技術記事をAI要約付きで提供するプラットフォームです。
            主要な機能を簡単にご紹介します。
          </p>
          <div className="flex gap-3">
            <Button onClick={startTour} className="flex-1">
              ツアーを開始
            </Button>
            <Button onClick={skipTour} variant="outline" className="flex-1">
              スキップ
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ツアーコンポーネント
  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: 'hsl(var(--primary))',
          zIndex: 10000,
        },
        spotlight: {
          borderRadius: '8px',
        },
        tooltip: {
          borderRadius: '8px',
        },
      }}
      locale={{
        back: '戻る',
        close: '閉じる',
        last: '完了',
        next: '次へ',
        skip: 'スキップ',
      }}
    />
  );
}