import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="border-primary/20 border-t-primary h-24 w-24 animate-spin rounded-full border-4" />
          <Loader2 className="text-primary absolute inset-0 m-auto h-10 w-10 animate-pulse" />
        </div>
        <div className="space-y-2 text-center">
          <p className="text-foreground text-lg font-semibold">読み込み中</p>
          <div className="flex items-center justify-center space-x-1">
            <span
              className="bg-primary h-2 w-2 animate-bounce rounded-full"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="bg-primary h-2 w-2 animate-bounce rounded-full"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="bg-primary h-2 w-2 animate-bounce rounded-full"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
