export function precisionQrId(text: string) {
  const token = text.trim();
  let id = '';
  if (/^agrigest:amostra:/i.test(token)) id = token.slice('agrigest:amostra:'.length);
  else {
    try {
      const link = new URL(token);
      if (link.protocol === 'https:' && /\/precision\/?$/.test(link.pathname)) id = link.searchParams.get('sample') ?? '';
    } catch { return null; }
  }
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
}

export async function readPrecisionQr(file: File) {
  if (!/^image\//.test(file.type) || file.size > 12000000) throw new Error('Selecione uma imagem de até 12 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const { default: decode } = await import('jsqr');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Não foi possível ler a imagem.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const qr = decode(data, width, height);
    const id = qr && precisionQrId(qr.data);
    if (!id) throw new Error('A imagem não contém um QR válido de amostra do AgriGest.');
    return id;
  } finally { bitmap.close(); }
}
