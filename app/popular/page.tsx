import { PopularArticles } from '@/app/components/popular/PopularArticles';

export default function PopularPage() {
  return (
    <>
      <h1 className="sr-only">人気記事ランキング</h1>
      <PopularArticles limit={20} />
    </>
  );
}
