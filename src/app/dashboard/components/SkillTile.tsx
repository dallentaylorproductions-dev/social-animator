'use client';

import Link from 'next/link';
import type { CallableSkill } from '@/skills/types';
import { skillRoute } from './skill-route';

interface SkillTileProps {
  skill: CallableSkill;
}

function outputSummary(skill: CallableSkill): string {
  const counts: Record<string, number> = {};
  for (const out of skill.outputs) {
    counts[out.format] = (counts[out.format] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([fmt, n]) => (n > 1 ? `${n}x ${fmt.toUpperCase()}` : fmt.toUpperCase()))
    .join(' + ');
}

export function SkillTile({ skill }: SkillTileProps) {
  return (
    <Link
      href={skillRoute(skill.id)}
      className="group block rounded-xl bg-neutral-900 border border-neutral-800 p-4 transition hover:border-[#4ef2d9]/50 hover:bg-neutral-800"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-tight">{skill.name}</h3>
        <span className="text-[9px] uppercase tracking-wider text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full flex-shrink-0">
          {outputSummary(skill)}
        </span>
      </div>
      <p className="text-xs text-neutral-400 mt-2 leading-relaxed line-clamp-2">
        {skill.purpose}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-[#4ef2d9] mt-3 opacity-0 group-hover:opacity-100 transition">
        Open →
      </p>
    </Link>
  );
}
