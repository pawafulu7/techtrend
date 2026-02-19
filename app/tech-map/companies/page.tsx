import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { CompanyTechAnalysisService } from '@/lib/services/company-tech-analysis-service';
import { prisma } from '@/lib/prisma';
import type { CompanyTechMatrix } from './types';
import CompaniesPageClient from './page-client';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Company Tech Stacks - TechTrend',
  description:
    'Analyze technology adoption patterns across company engineering blogs',
};

async function getInitialMatrix(): Promise<CompanyTechMatrix> {
  try {
    const service = new CompanyTechAnalysisService(prisma);
    return await service.getMatrix({ companyLimit: 30 });
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
