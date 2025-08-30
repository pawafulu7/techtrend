import { NextRequest, NextResponse } from 'next/server';
import { memoryOptimizer } from '@/lib/cache/memory-optimizer';
import { cacheWarmer } from '@/lib/cache/cache-warmer';

/**
 * キャッシュ最適化管理エンドポイント
 * GET: 最適化状態の取得
 * POST: 手動最適化の実行
 */
export async function GET() {
  try {
    const status = await memoryOptimizer.getStatus();
    const warmerStatus = cacheWarmer.getStatus();
    
    return NextResponse.json({
      optimizer: status,
      warmer: warmerStatus,
      timestamp: new Date().toISOString()
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to get optimization status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, target, aggressive = false } = body;
    
    let result;
    
    switch (action) {
      case 'optimize':
        // メモリ最適化実行
        await memoryOptimizer.optimizeManual(aggressive);
        result = { 
          message: `Memory optimization completed (aggressive: ${aggressive})`,
          status: await memoryOptimizer.getStatus()
        };
        break;
        
      case 'warm':
        // キャッシュウォーミング実行
        const targets = target ? [target] : undefined;
        await cacheWarmer.warmManual(targets);
        result = { 
          message: `Cache warming completed for: ${targets?.join(', ') || 'all'}`,
          status: cacheWarmer.getStatus()
        };
        break;
        
      case 'start-monitoring':
        // メモリ監視開始
        memoryOptimizer.startMonitoring();
        result = { message: 'Memory monitoring started' };
        break;
        
      case 'stop-monitoring':
        // メモリ監視停止
        memoryOptimizer.stopMonitoring();
        result = { message: 'Memory monitoring stopped' };
        break;
        
      case 'start-warming':
        // 定期ウォーミング開始
        cacheWarmer.startPeriodicWarming();
        result = { message: 'Periodic cache warming started' };
        break;
        
      case 'stop-warming':
        // 定期ウォーミング停止
        cacheWarmer.stopPeriodicWarming();
        result = { message: 'Periodic cache warming stopped' };
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid action. Valid actions: optimize, warm, start-monitoring, stop-monitoring, start-warming, stop-warming' },
          { status: 400 }
        );
    }
    
    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to execute optimization action' },
      { status: 500 }
    );
  }
}