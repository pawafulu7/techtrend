'use client';

import { ENTITY_TYPE_COLORS } from '../constants';

const EDGE_STYLES: Array<{ label: string; style: string }> = [
  { label: 'Depends On', style: 'border-t-2 border-solid border-slate-400' },
  { label: 'Alternative', style: 'border-t-2 border-dashed border-slate-400' },
  { label: 'Evolution', style: 'border-t-2 border-dotted border-slate-400' },
  { label: 'Part Of', style: 'border-t-4 border-solid border-slate-400' },
  { label: 'Integrates With', style: 'border-t border-solid border-slate-400' },
];

export function TechMapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-700 bg-slate-900/95 px-4 py-2 text-xs text-slate-300">
      {Object.entries(ENTITY_TYPE_COLORS).map(([type, { bg, label }]) => (
        <div key={type} className="flex items-center gap-1.5">
          <div className={`h-3 w-3 shrink-0 rounded-full ${bg}`} />
          <span>{label}</span>
        </div>
      ))}
      <div className="mx-2 h-4 w-px bg-slate-700" />
      {EDGE_STYLES.map(({ label, style }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className={`w-6 ${style}`} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
