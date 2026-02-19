import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import CompaniesPageClient from './page-client';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Company Tech Stacks - TechTrend',
  description:
    'Analyze technology adoption patterns across company engineering blogs',
};

interface CompanyTechMatrix {
  companies: { groupId: string; name: string; articleCount: number }[];
  technologies: { entityId: string; name: string; type: string }[];
  matrix: {
    companyGroupId: string;
    entityId: string;
    mentionCount: number;
  }[];
}

async function getInitialMatrix(): Promise<CompanyTechMatrix> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/tech-map/companies?limit=30`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return { companies: [], technologies: [], matrix: [] };
    }
    return await res.json();
  } catch {
    return { companies: [], technologies: [], matrix: [] };
  }
}

export default async function CompaniesPage() {
  const initialData = await getInitialMatrix();

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <PageHeader
        icon={Building2}
        title="Company Tech Stacks"
        description="Technology adoption patterns across company engineering blogs"
        count={
          initialData.companies.length > 0
            ? { value: initialData.companies.length, label: 'companies' }
            : undefined
        }
        variant="default"
        className="mb-6"
      />
      <CompaniesPageClient initialData={initialData} />
    </div>
  );
}
