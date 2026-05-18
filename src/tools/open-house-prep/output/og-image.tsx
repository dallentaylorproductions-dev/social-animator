import type { ReactElement } from 'react';
import type { HandoutRecord } from '@/lib/share-urls';
import type { OpenHousePrepDraft } from '../engine/types';

/**
 * OH-specific Open Graph card (1200×630). Consumed by /api/og/[slug]
 * when handout.type === 'open-house-handout'. Uses inline hex literals
 * (mirror of pdf-theme + globals.css source-of-truth values) because
 * next/og ImageResponse renders without CSS variable context.
 */

const COLORS = {
  canvas: '#0a0a0a',
  surface: '#141414',
  mint: '#4ef2d9',
  textPrimary: '#ededed',
  textSecondary: '#a3a3a3',
} as const;

interface AgentContact {
  name?: string;
  brokerage?: string;
}

export function renderOpenHouseOg(handout: HandoutRecord): ReactElement {
  const data = handout.data as Partial<OpenHousePrepDraft> & {
    agentContact?: AgentContact;
  };
  const address = data.propertyAddress ?? 'Open house';
  const city = data.propertyCity ?? '';
  const agentName = data.agentContact?.name ?? '';
  const eventDate = data.eventDate ?? '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        background: COLORS.canvas,
        color: COLORS.textPrimary,
        padding: '72px',
        fontFamily: 'system-ui, sans-serif',
        borderLeft: `8px solid ${COLORS.mint}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 22,
          color: COLORS.mint,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        Open house
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>
          {address}
        </div>
        {city && (
          <div style={{ fontSize: 32, color: COLORS.textSecondary }}>{city}</div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          fontSize: 22,
          color: COLORS.textSecondary,
        }}
      >
        <span>{agentName ? `Shared by ${agentName}` : 'Shared by your agent'}</span>
        {eventDate && <span>{eventDate}</span>}
      </div>
    </div>
  );
}
