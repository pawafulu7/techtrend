export type Category = 'FEATURE' | 'BUGFIX' | 'IMPROVEMENT' | 'OTHER';

export interface ChangelogEntry {
  id: string;
  content: string;
  titleJa?: string | null;
  contentJa?: string | null;
  category: Category;
  orderIndex: number;
}

export interface ChangelogVersion {
  id: string;
  version: string;
  sortOrder: number;
  createdAt: string;
  entryCount: number;
}

export interface ChangelogProject {
  id: string;
  slug: string;
  name: string;
  sourceUrl: string | null;
  iconUrl: string | null;
}

export interface ChangelogResponse {
  project: ChangelogProject;
  versions: ChangelogVersion[];
  entries: ChangelogEntry[];
  categoryCounts: Record<string, number>;
}
