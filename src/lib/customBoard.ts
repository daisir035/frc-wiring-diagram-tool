import type { PortDef, PortType } from './wiring';

export const CUSTOM_IMAGE_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const CUSTOM_IMAGE_MAX_BYTES = 750 * 1024;
export const CUSTOM_IMAGE_MAX_DIMENSION = 2048;

export function validateCustomImageFile(file: Pick<File, 'type' | 'size'>): void {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('请选择 PNG、JPG 或 WEBP 图片。');
  }
  if (file.size === 0 || file.size > CUSTOM_IMAGE_MAX_INPUT_BYTES) {
    throw new Error('图片大小须大于 0 且不超过 10 MB。');
  }
}

export function fitCustomImage(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('图片尺寸无效。');
  }
  const scale = Math.min(1, CUSTOM_IMAGE_MAX_DIMENSION / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/** Decode and re-encode raster uploads so stored images have bounded dimensions and size. */
export async function prepareCustomImage(file: File): Promise<{ data: string; w: number; h: number }> {
  validateCustomImageFile(file);
  const source = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('无法读取图片，请确认文件完整且格式正确。'));
      img.src = source;
    });
    let { w, h } = fitCustomImage(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理图片，请重试。');
    const encode = (type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片压缩失败，请更换图片。')), type, quality);
    });
    let output: Blob | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      canvas.width = w;
      canvas.height = h;
      context.drawImage(img, 0, 0, w, h);
      // Preserve crisp artwork losslessly whenever it fits the storage budget.
      output = await encode('image/png');
      if (output.size <= CUSTOM_IMAGE_MAX_BYTES) break;
      output = await encode('image/webp', 0.86);
      if (output.size <= CUSTOM_IMAGE_MAX_BYTES) break;
      w = Math.max(1, Math.round(w * 0.75));
      h = Math.max(1, Math.round(h * 0.75));
      output = undefined;
    }
    if (!output) throw new Error('压缩后的图片仍然过大，请裁剪后重试。');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('读取压缩图片失败，请重试。'));
      reader.readAsDataURL(output);
    });
    return { data, w: canvas.width, h: canvas.height };
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function oppositePairType(type: PortType): PortType | undefined {
  return type === 'canH' ? 'canL' : type === 'canL' ? 'canH'
    : type === 'pwr+' ? 'pwr-' : type === 'pwr-' ? 'pwr+' : undefined;
}

/** Keep both ends reciprocal and release old partners when a pairing is changed. */
export function pairCustomPorts(ports: PortDef[], portId: string, partnerId?: string): PortDef[] {
  const source = ports.find((port) => port.id === portId);
  const partner = ports.find((port) => port.id === partnerId);
  const validPartner = source && partner && oppositePairType(source.type) === partner.type ? partner.id : undefined;
  return ports.map((port) => {
    if (port.id === portId) return { ...port, pairId: validPartner };
    if (port.id === validPartner) return { ...port, pairId: portId };
    if (port.pairId === portId || (validPartner && port.pairId === validPartner)) return { ...port, pairId: undefined };
    return port;
  });
}
