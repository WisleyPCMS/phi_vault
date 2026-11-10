// Resize before sending so 5 MB source images fit Vercel's function request limit.
export async function prepareArtwork(file: File): Promise<File> {
  if (file.size > 5_000_000 || !['image/png','image/jpeg','image/webp'].includes(file.type)) {
    throw new Error('請選擇 5 MB 以內的 PNG、JPG 或 WebP 圖片');
  }
  if (file.size <= 3_000_000) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('瀏覽器無法處理圖片');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .86));
    if (!blob || blob.size > 3_000_000) throw new Error('圖片過大，請縮小後重試');
    return new File([blob], 'artwork.webp', {type: 'image/webp'});
  } finally { bitmap.close(); }
}
