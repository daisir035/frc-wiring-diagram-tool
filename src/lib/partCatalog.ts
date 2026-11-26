import type { PartDef } from './wiring.ts';
import { PART_CATEGORIES } from './wiring.ts';

/**
 * How the 器件库 is arranged: each category is split into small groups in the order a team
 * wires a robot (power source → distribution → protection → terminals). Parts that differ only
 * by size share one card; the inspector picks the exact model.
 */
export interface LibraryGroup {
  /** Empty for a category that needs no sub-heading. */
  label: string;
  parts: string[];
}

export const LIBRARY_GROUPS: Record<string, LibraryGroup[]> = {
  控制: [
    { label: '', parts: ['roborio', 'canivore', 'vh109', 'rsl'] },
  ],
  配电: [
    { label: '电池与总开关', parts: ['battery12v', 'breaker120'] },
    { label: '配电板', parts: ['pdh', 'pdp', 'miniPdp'] },
    { label: '稳压与保险', parts: ['vrm', 'fuseAuto10'] },
    { label: '接线端子', parts: ['terminalPair', 'terminal2To4'] },
  ],
  电机: [
    { label: '', parts: ['krakenX60', 'krakenX44', 'falcon500'] },
  ],
  传感器: [
    { label: '编码器与陀螺仪', parts: ['cancoder', 'pigeon2', 'ttb', 'pot'] },
    { label: '开关与光电', parts: ['lmSwitch', 'beamBreak', 'npnPhoto'] },
  ],
  视觉与灯光: [
    { label: '', parts: ['limelight4', 'limelight3', 'c270', 'ws2812'] },
  ],
  气动: [
    { label: '控制模块', parts: ['ph', 'pcm'] },
    { label: '气源', parts: ['pneumatic-compressor', 'pneumatic-tank', 'pneumatic-relief', 'pneumatic-pressure-switch', 'pneumatic-analog-pressure-sensor', 'pneumatic-vent'] },
    { label: '调压与压力表', parts: ['pneumatic-regulator', 'pneumatic-gauge'] },
    { label: '电磁阀', parts: ['pneumatic-single-solenoid', 'pneumatic-double-solenoid', 'pneumatic-manifold-solenoid-3'] },
    { label: '气缸与执行件', parts: ['am-2034_2', 'am-4229', 'am-4388', 'pneumatic-suction-cup', 'pneumatic-vacuum-generator'] },
    { label: '管件', parts: ['pneumatic-tee', 'pneumatic-plug', 'pneumatic-muffler'] },
  ],
};

/** Size variants that share a card with the part above; still found by search. */
export const LIBRARY_VARIANTS: Record<string, string> = {
  'am-2034_05': 'am-2034_2',
  'am-2034_4': 'am-2034_2',
  'am-2034_6': 'am-2034_2',
  'am-2034_7': 'am-2034_2',
};

/** Shorter card names where the full model name would wrap past two lines. */
export const LIBRARY_NAMES: Record<string, string> = {
  'am-2034_2': '双作用气缸',
  'am-4229': '弹簧伸出气缸',
  'am-4388': '薄型气缸',
  'pneumatic-manifold-solenoid-3': '阀岛电磁阀',
};

/** Card name: the short name, or for a size variant found by search, its shared card's name plus the size. */
export function libraryName(def: PartDef): string {
  const base = LIBRARY_VARIANTS[def.id];
  const stroke = def.cylinder?.strokeMm;
  if (base && LIBRARY_NAMES[base] && stroke) {
    const inches = Math.round((stroke / 25.4) * 10) / 10;
    return `${LIBRARY_NAMES[base]} · ${inches} in 行程`;
  }
  return LIBRARY_NAMES[def.id] ?? def.name;
}

/** Shown on hover: what the inspector lets you change after placing a shared card. */
export const LIBRARY_HINTS: Record<string, string> = {
  'am-2034_2': '放置后可在检查器里选缸径和行程',
  'am-4229': '放置后可在检查器里改型号',
  'am-4388': '放置后可在检查器里改型号',
  'pneumatic-manifold-solenoid-3': '放置后可在检查器里选 1–6 联',
};

export interface LibrarySection {
  category: string;
  groups: Array<{ label: string; defs: PartDef[] }>;
  count: number;
}

const searchText = (def: PartDef, group: string) =>
  `${def.name} ${LIBRARY_NAMES[def.id] ?? ''} ${def.id} ${def.category} ${group} ${def.caption ?? ''}`.toLocaleLowerCase();

/**
 * Arrange the visible parts into categories and groups. Parts the catalog doesn't name (custom
 * boards, or a built-in added later) still appear, at the end of their category.
 */
export function librarySections(defs: PartDef[], query = '', category = 'all'): LibrarySection[] {
  const normalized = query.trim().toLocaleLowerCase();
  const byId = new Map(defs.map((def) => [def.id, def]));
  const placed = new Set<string>();
  const sections: LibrarySection[] = [];
  for (const cat of PART_CATEGORIES) {
    if (category !== 'all' && category !== cat) continue;
    const groups: LibrarySection['groups'] = [];
    for (const group of LIBRARY_GROUPS[cat] ?? []) {
      const list: PartDef[] = [];
      for (const id of group.parts) {
        const def = byId.get(id);
        if (!def) continue;
        placed.add(id);
        // While searching, a size variant can stand in for its shared card.
        const variants = normalized ? defs.filter((item) => LIBRARY_VARIANTS[item.id] === id) : [];
        variants.forEach((item) => placed.add(item.id));
        if (!normalized || searchText(def, group.label).includes(normalized)) list.push(def);
        list.push(...variants.filter((item) => searchText(item, group.label).includes(normalized)));
      }
      if (list.length) groups.push({ label: group.label, defs: list });
    }
    const rest = defs.filter((def) => def.category === cat && !placed.has(def.id) && !LIBRARY_VARIANTS[def.id] && !def.hideInLibrary
      && (!normalized || searchText(def, '').includes(normalized)));
    rest.forEach((def) => placed.add(def.id));
    if (rest.length) groups.push({ label: groups.length && cat !== '自定义' ? '其他' : '', defs: rest });
    const count = groups.reduce((sum, group) => sum + group.defs.length, 0);
    if (count) sections.push({ category: cat, groups, count });
  }
  return sections;
}
