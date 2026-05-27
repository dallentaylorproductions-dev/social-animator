import type { TileStage } from './Tile';

export function StageHeader({
  index,
  label,
  hint,
  stage,
}: {
  index: number;
  label: string;
  hint: string;
  stage: TileStage;
}) {
  return (
    <header
      className="stage-head"
      data-stage={stage}
      data-testid={`sep-stage-head-${stage}`}
    >
      <div className="stage-num">{String(index).padStart(2, '0')}</div>
      <div className="stage-text">
        <div className="stage-label">{label}</div>
        <div className="stage-hint">{hint}</div>
      </div>
      <div className="stage-rule" />
    </header>
  );
}
