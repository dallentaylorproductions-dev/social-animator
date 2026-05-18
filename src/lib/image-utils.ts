/**
 * Browser-side image utilities (OH Prep Commit 7).
 *
 * Used by tool form fields that accept user-uploaded photos. Keeps
 * data URL payloads under typical localStorage tolerances by resizing
 * larger images to a max width via Canvas API, JPEG-encoded at 85%
 * quality. Typical phone photo (3-5 MB) resizes to under 500 KB.
 *
 * No external dependencies — uses native FileReader + Image + Canvas.
 * Runs only in the browser; callers must guard SSR with their own
 * client-component boundary.
 */

const DEFAULT_MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.85;

/**
 * Read a File (typically from <input type="file">) and return a data
 * URL that fits within `maxWidth` pixels of horizontal resolution.
 * Aspect ratio preserved. Re-encoded as JPEG. Images already smaller
 * than `maxWidth` pass through unchanged (no quality loss from a
 * pointless re-encode).
 */
export async function resizeImageToDataURL(
  file: File,
  maxWidth: number = DEFAULT_MAX_WIDTH,
): Promise<string> {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);
  if (img.width <= maxWidth) return dataUrl;

  const ratio = maxWidth / img.width;
  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = Math.round(img.height * ratio);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}
