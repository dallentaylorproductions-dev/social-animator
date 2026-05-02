import { type FlyerPhoto } from "./types";

/**
 * Wrap a File in a FlyerPhoto: object URL for preview/PDF, lazy-materialized
 * HTMLImageElement for canvas pipeline.
 *
 * Caller is responsible for revoking the object URL when the photo is removed
 * (see `revokePhoto`).
 */
export function makePhoto(file: File): FlyerPhoto {
  const url = URL.createObjectURL(file);
  const photo: FlyerPhoto = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    url,
    img: null,
  };
  // Kick off image load so the canvas pipeline doesn't have to wait at export
  // time. Stores back into the same FlyerPhoto so list state can be updated by
  // a callback if needed.
  const img = new Image();
  img.onload = () => {
    photo.img = img;
  };
  img.onerror = () => {
    photo.img = null;
  };
  img.src = url;
  return photo;
}

export function revokePhoto(photo: FlyerPhoto): void {
  try {
    URL.revokeObjectURL(photo.url);
  } catch {
    // ignore
  }
}

/**
 * Wait until a photo's HTMLImageElement is loaded (or a timeout fires).
 * Used by export paths that need the canvas-ready image immediately.
 */
export function waitForPhoto(
  photo: FlyerPhoto,
  timeoutMs = 4000
): Promise<HTMLImageElement | null> {
  if (photo.img) return Promise.resolve(photo.img);
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (photo.img) return resolve(photo.img);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 50);
    };
    tick();
  });
}
