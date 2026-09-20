/** Scale artwork proportionally so portrait and landscape images share the same maximum extent. */
export function imageDisplaySize(width: number, height: number, maxDimension: number) {
  if (![width, height, maxDimension].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('图片显示尺寸必须为有限正数');
  }
  const longest = Math.max(width, height);
  return { w: maxDimension * (width / longest), h: maxDimension * (height / longest) };
}
