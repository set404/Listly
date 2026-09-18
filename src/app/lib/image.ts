// ─── Item photo compression ────────────────────────────────────────────────
//
// Item photos travel as base64 data URLs in the JSON request body (no file
// storage service is wired up), so they're downscaled and re-encoded as JPEG
// client-side first to keep payloads small. Two passes: a normal-quality one,
// then a smaller/lower-quality retry if the first still came out too big.

async function encodeImage(file: File, maxDim: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    bitmap.close();
  }
}

const MAX_IMAGE_DATA_URL_LENGTH = 2_000_000; // stays comfortably under the server's cap

export async function compressImageToDataUrl(file: File): Promise<string> {
  const first = await encodeImage(file, 1024, 0.75);
  if (first.length <= MAX_IMAGE_DATA_URL_LENGTH) return first;
  const second = await encodeImage(file, 720, 0.6);
  if (second.length <= MAX_IMAGE_DATA_URL_LENGTH) return second;
  throw new Error("Image too large even after compression");
}
