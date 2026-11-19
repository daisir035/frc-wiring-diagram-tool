import type { CanvasBackground } from './wiring';

export type BackgroundCorner = 'nw' | 'ne' | 'sw' | 'se';

export function resizeBackgroundToWidth(background: CanvasBackground, width: number): CanvasBackground {
  const nextWidth = Math.max(24 * background.width / Math.min(background.width, background.height), width);
  if (Math.abs(nextWidth - background.width) < 0.001) return background;
  return {
    ...background,
    width: nextWidth,
    height: background.height * nextWidth / background.width,
    // Resizing the reference image alone changes its relationship to the calibrated drawing.
    calibratedWidthMm: undefined,
  };
}

export function resizeBackgroundFromCorner(
  background: CanvasBackground,
  corner: BackgroundCorner,
  point: { x: number; y: number },
): CanvasBackground {
  const sx = corner.endsWith('e') ? 1 : -1;
  const sy = corner.startsWith('s') ? 1 : -1;
  const anchorX = background.x + (sx < 0 ? background.width : 0);
  const anchorY = background.y + (sy < 0 ? background.height : 0);
  const scale = ((point.x - anchorX) * sx * background.width +
    (point.y - anchorY) * sy * background.height) / (background.width ** 2 + background.height ** 2);
  const next = resizeBackgroundToWidth(background, background.width * scale);
  return { ...next, x: anchorX - (sx < 0 ? next.width : 0), y: anchorY - (sy < 0 ? next.height : 0) };
}
