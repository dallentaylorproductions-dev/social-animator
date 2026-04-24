import { EasingFn, linear } from "./easing";

export interface Track {
  id: string;
  start: number;      // seconds from timeline start
  duration: number;   // seconds
  easing?: EasingFn;
  loop?: boolean;     // if true, progress cycles 0→1 repeatedly after start
  onUpdate: (progress: number, ctx: CanvasRenderingContext2D) => void;
}

export class Timeline {
  tracks: Track[];
  duration: number; // longest non-looping track end time

  constructor(tracks: Track[]) {
    this.tracks = tracks;
    const nonLooping = tracks.filter((t) => !t.loop);
    this.duration =
      nonLooping.length > 0
        ? Math.max(...nonLooping.map((t) => t.start + t.duration))
        : 0;
  }

  render(currentTime: number, ctx: CanvasRenderingContext2D) {
    for (const track of this.tracks) {
      if (currentTime < track.start) continue;

      let rawProgress: number;
      if (track.loop) {
        const elapsed = (currentTime - track.start) % track.duration;
        rawProgress = elapsed / track.duration;
      } else {
        rawProgress = Math.min(1, (currentTime - track.start) / track.duration);
      }

      const clamped = Math.max(0, Math.min(1, rawProgress));
      const eased = (track.easing ?? linear)(clamped);

      ctx.save();
      track.onUpdate(eased, ctx);
      ctx.restore();
    }
  }
}
