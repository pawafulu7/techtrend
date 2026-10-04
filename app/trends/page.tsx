import { TrendsContent } from './_components/trends-content';
import {
  fetchKeywordsData,
  fetchAnalysisData,
  fetchSourceData,
} from './_components/trends-data';

export const dynamic = 'force-dynamic';

function valueOrNull<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

export default async function TrendsPage() {
  // 1つの取得が失敗しても他のセクションは表示する。失敗したセクションは null で渡し、
  // 画面側で「0件」ではなく失敗と再試行を出す（issue #701）
  const [keywordsResult, analysisResult, sourceResult] =
    await Promise.allSettled([
      fetchKeywordsData(),
      fetchAnalysisData(7),
      fetchSourceData(),
    ]);
  const keywordsData = valueOrNull(keywordsResult);

  return (
    <TrendsContent
      initialKeywords={keywordsData?.trending ?? null}
      initialNewTags={keywordsData?.newTags ?? null}
      initialAnalysis={valueOrNull(analysisResult)}
      initialSourceData={valueOrNull(sourceResult)}
    />
  );
}
