'use client';

export function TechMapSkeleton() {
  return (
    <div className="flex h-[calc(100vh-3rem)] w-full items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white" />
        <p className="text-sm text-slate-300">Tech Map を読み込み中...</p>
      </div>
    </div>
  );
}
