/**
 * Poster-style annotations drawn under the wiring: dashed section frames, note blocks and the
 * title block with its automatic legend, after Team 3161's FRC control system diagrams.
 */
export type AnnotationKind = 'section' | 'note' | 'title';

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  /** Note text, or the team / subtitle line of a title block. Newlines are kept. */
  body?: string;
  /** Notes only: draw the dashed frame around the text. */
  framed?: boolean;
}

export const ANNOTATION_DEFAULTS: Record<AnnotationKind, Omit<Annotation, 'id' | 'x' | 'y'>> = {
  section: { kind: 'section', w: 420, h: 300, title: '分区名称' },
  note: { kind: 'note', w: 220, h: 70, title: '说明标题', body: '在属性面板编辑说明文字。', framed: true },
  title: { kind: 'title', w: 900, h: 110, title: 'FRC 气动系统', body: 'TEAM 0000' },
};

export const ANNOTATION_NAMES: Record<AnnotationKind, string> = { section: '分区框', note: '说明', title: '标题栏与图例' };

/** Minimum sizes keep text from overflowing while resizing. */
export const ANNOTATION_MIN: Record<AnnotationKind, { w: number; h: number }> = {
  section: { w: 60, h: 40 },
  note: { w: 80, h: 30 },
  title: { w: 520, h: 90 },
};
