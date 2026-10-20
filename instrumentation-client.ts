import { notifyRouterTransitionStart } from './app/hooks/use-router-transition-pending';

/**
 * Next は App Router の遷移を始めるたびに、その遷移の transition の中でこれを呼ぶ。リーダーは遷移の途中に
 * native History API で URL を書かないために使う（Next はその書き込みで、待っている遷移を捨てる。issue #810）
 */
export function onRouterTransitionStart(): void {
  notifyRouterTransitionStart();
}
