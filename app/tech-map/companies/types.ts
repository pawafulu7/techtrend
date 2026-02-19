export interface Company {
  groupId: string;
  name: string;
  articleCount: number;
}

export interface Technology {
  entityId: string;
  name: string;
  type: string;
}

export interface MatrixEntry {
  companyGroupId: string;
  entityId: string;
  mentionCount: number;
}

export interface CompanyTechMatrix {
  companies: Company[];
  technologies: Technology[];
  matrix: MatrixEntry[];
}

export interface TimelineEntry {
  month: string;
  entities: { entityId: string; name: string; count: number }[];
}

export interface CompanyTimelineData {
  company: { groupId: string; name: string };
  timeline: TimelineEntry[];
}
