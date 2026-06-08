/**
 * Shared client-side image upload pipeline (extracted from
 * <ImageUploadField> so the Settings headshot "Replace" affordance can
 * reuse the exact same downscale → /api/upload-image → hosted-URL
 * contract without duplicating the canvas/EXIF-strip logic).
 *
 * Why this lives in a lib and not the component: UX-2b-followup gives the
 * headshot its own filled-state display (a cropped circular avatar with
 * Adjust/Replace/Remove) that no longer renders ImageUploadField, yet
 * still needs to re-upload on "Replace". Both call sites share THIS
 * function, so the multipart contract (downscaled JPEG, optional folder
 * field, hosted-URL response) stays identical and single-sourced.
 *
 * Browser-only: uses <canvas>, FileReader, and Image. Callers are client
 * components.
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Downscale + EXIF-strip the file, POST it to /api/upload-image, and
 * resolve to the hosted URL. Throws on any failure (caller surfaces the
 * message). `folder` becomes the Blob subpath when provided.
 */
export async function uploadImageFile(
  file: File,
  folder?: string,
): Promise<string> {
  const downscaled = await downscaleImage(file);
  const fd = new FormData();
  fd.append("file", downscaled, downscaled.name);
  if (folder) fd.append("folder", folder);
  const res = await fetch("/api/upload-image", {
    method: "POST",
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.url) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return data.url;
}

/**
 * Downscale + transcode to JPEG via the canvas API. Returns a new File
 * with the JPEG bytes — the route writes that as-is to Blob.
 *
 * If the source is already smaller than MAX_EDGE on both sides AND is
 * already a JPEG / PNG / WebP that the route accepts, we still
 * re-encode through canvas so we strip EXIF (privacy: phone GPS
 * coordinates in the metadata don't end up on a public buyer page).
 */
async function downscaleImage(file: File): Promise<File> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const { width, height } = fitWithin(
    img.naturalWidth,
    img.naturalHeight,
    MAX_EDGE,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Canvas unavailable — fall through with the original file. The
    // route's 8 MiB cap is still in force as the backstop.
    return file;
  }
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return file;
  const nameBase = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${nameBase}.jpg`, { type: "image/jpeg" });
}

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = w >= h ? max / w : max / h;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}
