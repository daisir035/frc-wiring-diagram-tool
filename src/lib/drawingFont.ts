// The drawing typeface. Loaded from the bundle (not the system) so every computer, and every
// exported PNG, shows the same narrow labels. Chinese falls through to the system CJK font.
import '@fontsource/saira-semi-condensed/latin-400.css';
import '@fontsource/saira-semi-condensed/latin-600.css';
import '@fontsource/saira-semi-condensed/latin-700.css';
import regular from '@fontsource/saira-semi-condensed/files/saira-semi-condensed-latin-400-normal.woff2?url';
import semibold from '@fontsource/saira-semi-condensed/files/saira-semi-condensed-latin-600-normal.woff2?url';
import bold from '@fontsource/saira-semi-condensed/files/saira-semi-condensed-latin-700-normal.woff2?url';

export const DRAWING_FONT = "'Saira Semi Condensed', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";

const FACES: Array<[string, number]> = [[regular, 400], [semibold, 600], [bold, 700]];

let cached: Promise<string> | null = null;

const toDataUrl = async (url: string) => {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

/**
 * @font-face rules with the font files inlined. An SVG drawn into a canvas through <img> cannot
 * reach the page's fonts, so the export embeds them; without this the PNG falls back to a serif.
 */
export function embeddedDrawingFontCss(): Promise<string> {
  cached ??= Promise.all(FACES.map(async ([url, weight]) =>
    `@font-face{font-family:'Saira Semi Condensed';font-style:normal;font-weight:${weight};src:url(${await toDataUrl(url)}) format('woff2');}`,
  )).then((rules) => rules.join('')).catch(() => {
    cached = null;
    return '';
  });
  return cached;
}
