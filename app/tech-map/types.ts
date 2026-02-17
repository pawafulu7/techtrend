/**
 * Shared types for the tech-map feature.
 */

export interface ApiEntity {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
}

export type ApiNode = ApiEntity;

export interface ApiEdge {
  source: string;
  target: string;
  relationType: string;
  strength: number;
}
