import { TrendsContent } from './_components/trends-content';
import {
  fetchKeywordsData,
  fetchAnalysisData,
  fetchSourceData,
} from './_components/trends-data';

export default async function TrendsPage() {
  const [keywordsData, initialAnalysis, sourceData] = await Promise.all([
    fetchKeywordsData(),
    fetchAnalysisData(7),
    fetchSourceData(),
  ]);

  return (
    <TrendsContent
      initialKeywords={keywordsData.trending}
      initialNewTags={keywordsData.newTags}
      initialAnalysis={initialAnalysis}
      initialSourceData={sourceData}
    />
  );
}
