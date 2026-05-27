/**
 * Decorative placeholder photo block used inside several posters
 * (flyer / open-house / doc / presentation). Renders a tinted gradient
 * with diagonal stripes + a mono label so the agent's mental model is
 * "where the listing photo would go." Pure CSS — no real images.
 */

const TINTS = {
  cool: 'linear-gradient(135deg, oklch(0.42 0.04 230) 0%, oklch(0.32 0.03 250) 100%)',
  warm: 'linear-gradient(135deg, oklch(0.45 0.05 60) 0%, oklch(0.34 0.04 40) 100%)',
  mint: 'linear-gradient(135deg, oklch(0.55 0.10 175) 0%, oklch(0.38 0.08 190) 100%)',
  rose: 'linear-gradient(135deg, oklch(0.48 0.08 20) 0%, oklch(0.35 0.06 10) 100%)',
} as const;

export type PhotoBlockTint = keyof typeof TINTS;

export function PhotoBlock({
  label = 'PROPERTY PHOTO',
  height = '100%',
  tint = 'cool',
}: {
  label?: string;
  height?: string;
  tint?: PhotoBlockTint;
}) {
  return (
    <div className="photo-block" style={{ background: TINTS[tint], height }}>
      <div className="photo-stripes" />
      {label && <span className="photo-label">{label}</span>}
    </div>
  );
}
