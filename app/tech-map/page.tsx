import TechMapPageClient from './page-client';

interface ApiEntity {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
}

async function getInitialEntities(): Promise<ApiEntity[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(
      `${baseUrl}/api/tech-map/entities?sort=mentionCount&limit=50`,
      {
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.entities || [];
  } catch {
    // During build or when API unavailable, return empty
    return [];
  }
}

export default async function TechMapPage() {
  const initialEntities = await getInitialEntities();

  return <TechMapPageClient initialEntities={initialEntities} />;
}
