import ExcelJS from 'exceljs';
import type { BomReport } from './bom.ts';

const FIRST_ROW = 6;
const text = (value: string) => value ? value.slice(0, 32767) : null;
const colors = { ink: '243746', header: '176B79', border: 'D8E2E7', stripe: 'F2F7F9', link: '1666A7' };

function createTable(workbook: ExcelJS.Workbook, name: string, title: string, description: string, columns: Array<[string, number]>) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }] });
  sheet.columns = columns.map(([, width]) => ({ width }));
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell('A1').value = text(title);
  sheet.getCell('A1').font = { name: 'Microsoft YaHei', size: 18, bold: true, color: { argb: colors.ink } };
  sheet.getRow(1).height = 32;
  sheet.mergeCells(2, 1, 3, columns.length);
  sheet.getCell('A2').value = text(description);
  sheet.getCell('A2').font = { name: 'Microsoft YaHei', size: 10, color: { argb: '546574' } };
  sheet.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  sheet.getRow(2).height = 24;
  sheet.getRow(3).height = 24;
  sheet.getRow(5).values = columns.map(([label]) => label);
  sheet.getRow(5).height = 32;
  sheet.getRow(5).eachCell((cell) => {
    cell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.header } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });
  sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:5' };
  return sheet;
}

function finishTable(sheet: ExcelJS.Worksheet) {
  const last = Math.max(5, sheet.rowCount);
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: last, column: sheet.columnCount } };
  for (let index = FIRST_ROW; index <= last; index++) {
    const row = sheet.getRow(index);
    let lines = 1;
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const value = cell.text;
      const width = sheet.getColumn(column).width ?? 14;
      lines = Math.max(lines, ...value.split('\n').map((line) => Math.ceil([...line].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0) / Math.max(4, width - 2))));
      cell.font = { name: 'Microsoft YaHei', size: 10, color: { argb: colors.ink } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: colors.border } } };
      if (index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.stripe } };
      if (typeof cell.value === 'number' || cell.type === ExcelJS.ValueType.Formula) cell.alignment.horizontal = 'right';
      if (cell.type === ExcelJS.ValueType.Hyperlink) cell.font = { ...cell.font, underline: true, color: { argb: colors.link } };
    });
    row.height = Math.min(409, Math.max(28, lines * 15 + 8));
  }
}

function sourceValue(source: string): ExcelJS.CellValue {
  try {
    const url = new URL(source);
    if (url.protocol === 'https:' || url.protocol === 'http:') return { text: '产品 / 来源', hyperlink: url.href };
  } catch { /* Missing or relative URLs remain plain text. */ }
  return text(source);
}

export function createBomWorkbook(report: BomReport, createdAt = new Date()) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRC WireSheet';
  workbook.created = createdAt;
  workbook.modified = createdAt;
  workbook.calcProperties.fullCalcOnLoad = true;
  const scope = report.options.scope === 'project' ? '当前工程全部页面' : '当前页面';
  const summary = createTable(workbook, 'BOM 汇总', `${report.project} - BOM`,
    `${scope}；共 ${report.pages.length} 页。线长为平面备料估算，非最终裁线长度。相同实物在不同页面重复绘制时会重复计数。`,
    [['序号', 8], ['类别', 22], ['物料名称', 34], ['规格', 34], ['数量', 14], ['单位', 8], ['涉及页面', 26], ['备注', 52], ['来源', 18]]);
  const parts = createTable(workbook, '器件明细', '器件明细', '每行对应一个器件或线内端子实例。尺寸为未旋转外形；参考尺寸不等于厂家确认尺寸。',
    [['页面', 24], ['实例 ID', 26], ['器件型号', 34], ['自定义名称', 26], ['设备 / CAN ID', 20], ['宽度(mm)', 14], ['高度(mm)', 14], ['尺寸依据', 16], ['来源', 18]]);
  const lines = createTable(workbook, '线路明细', '线路与线长明细',
    '现场导线按单芯逐条统计，双芯线有两行。成品线的接头已包含在成品线数量中。拖链 / 束线管每组只计一次；线长不包含三维高度差、绞合增量及运动行程。',
    [['页面', 24], ['导线 / 护套 ID', 28], ['所属线缆 ID', 26], ['A 端', 42], ['B 端', 42], ['类型', 14], ['线色', 12], ['AWG', 10], ['平面长度(m)', 16], ['备料估算(m)', 16], ['A 端子', 24], ['B 端子', 24], ['备注', 52], ['BOM 序号', 12]]);
  const parameters = workbook.addWorksheet('估算参数', { views: [{ showGridLines: false }] });
  parameters.columns = [{ width: 30 }, { width: 24 }, { width: 20 }, { width: 65 }];
  parameters.mergeCells('A1:D1');
  parameters.getCell('A1').value = '估算参数与待核对项';
  parameters.getCell('A1').font = { name: 'Microsoft YaHei', size: 16, bold: true, color: { argb: colors.ink } };
  parameters.getRow(1).height = 32;
  parameters.getRow(2).values = ['导出时间', createdAt];
  parameters.getCell('B2').numFmt = 'yyyy-mm-dd hh:mm';
  parameters.getRow(3).values = ['导线预留比例', report.options.sparePercent / 100, null, '可调整；影响现场导线和成品线的备料估算，不影响护套长度。'];
  parameters.getCell('B3').numFmt = '0%';
  parameters.getRow(4).values = ['每端预留', report.options.tailMm, 'mm', '每条线路累计 A/B 两端预留，向上取整到 0.01 m；中间接插件附加余量另计。'];
  parameters.getCell('B3').dataValidation = { type: 'decimal', operator: 'between', formulae: [0, 1], showErrorMessage: true, errorTitle: '比例无效', error: '请输入 0 到 1 之间的比例。' };
  parameters.getCell('B4').dataValidation = { type: 'decimal', operator: 'between', formulae: [0, 10000], showErrorMessage: true, errorTitle: '长度无效', error: '请输入 0 到 10000 mm。' };
  parameters.getRow(5).values = ['长度算法', '正交中心线路径', '1 世界单位 = 1 mm', '器件端口、绕线控制点、拖链内部与外部引线均纳入累计；屏幕缩放不参与计算。'];
  parameters.getRow(6).values = ['端子统计', '默认端子是估算', null, '单芯冷压端子逐芯计数；多芯接插件同一线缆端点计一套；共享中间接插件计一套。型号、极数、压接尺寸需在采购前核对。'];
  parameters.getRow(8).values = ['页面', '底盘图', '标定实宽(mm)', '状态'];
  for (const page of report.pages) parameters.addRow([text(page.name), text(page.background), page.calibratedWidthMm,
    page.background ? page.calibratedWidthMm ? '已按整幅底盘图宽度标定；白边也包含在标定范围内。' : '底盘图未标定；长度暂按画布毫米比例。' : '无底盘图；长度按画布毫米比例。']);
  parameters.addRow([]);
  parameters.addRow(['待核对项']);
  for (const warning of report.warnings.length ? report.warnings : ['无缺失端口或未标定底盘图。仍需核对实物接插件和三维走线。']) {
    const row = parameters.addRow([text(warning)]);
    parameters.mergeCells(row.number, 1, row.number, 4);
    row.height = Math.max(32, Math.ceil(warning.length / 70) * 18);
  }
  parameters.eachRow((row) => {
    if (row.number !== 1) row.height = Math.max(row.height ?? 0, row.number <= 6 ? 48 : 32);
    row.eachCell((cell) => {
      if (row.number !== 1) cell.font = { name: 'Microsoft YaHei', size: 10, color: { argb: colors.ink } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  });
  for (const address of ['B3', 'B4']) {
    parameters.getCell(address).font = { name: 'Microsoft YaHei', size: 11, color: { argb: '1666A7' } };
    parameters.getCell(address).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8F3FC' } };
  }
  const itemIndices = new Map(report.items.map((item, index) => [item.key, index + 1]));
  for (const line of report.lines) {
    const row = lines.addRow([text(line.page), text(line.id), text(line.cableId), text(line.from), text(line.to), line.kind, text(line.color), line.awg,
      line.lengthM, null, text(line.terminalA), text(line.terminalB), text(line.notes), itemIndices.get(line.itemKey)]);
    if (line.lengthM !== null) {
      row.getCell(10).value = { formula: line.kind === '拖链' || line.kind === '束线管' ? `I${row.number}`
        : `ROUNDUP((I${row.number}*(1+'估算参数'!$B$3)+2*'估算参数'!$B$4/1000)*100,0)/100`, result: line.stockM! };
    }
    row.getCell(9).numFmt = '0.000';
    row.getCell(10).numFmt = '0.00';
  }
  const lastLine = Math.max(FIRST_ROW, lines.rowCount);
  for (const [index, item] of report.items.entries()) {
    const row = summary.addRow([index + 1, text(item.category), text(item.name), text(item.specification), item.quantity, item.unit,
      text(item.pages.join('\n')), text(item.notes.join('；')), sourceValue(item.source)]);
    if (item.unit === 'm') {
      const ids = `'线路明细'!$N$${FIRST_ROW}:$N$${lastLine}`;
      const measured = `'线路明细'!$I$${FIRST_ROW}:$I$${lastLine}`;
      const values = `'线路明细'!$J$${FIRST_ROW}:$J$${lastLine}`;
      row.getCell(5).value = { formula: `IF(COUNTIFS(${ids},A${row.number},${measured},"<>",${measured},">=0")=0,"未估算",SUMIFS(${values},${ids},A${row.number}))`, result: item.quantity ?? '未估算' };
      row.getCell(5).numFmt = '0.00';
    } else row.getCell(5).numFmt = '0';
  }
  for (const part of report.parts) {
    const row = parts.addRow([text(part.page), text(part.id), text(part.name), text(part.instance), text(part.deviceId), part.w, part.h, part.sizeStatus, sourceValue(part.source)]);
    row.getCell(6).numFmt = row.getCell(7).numFmt = '0.000';
  }
  for (const sheet of [summary, parts, lines]) finishTable(sheet);
  return workbook;
}

export async function exportBomBuffer(report: BomReport) {
  const workbook = createBomWorkbook(report);
  return workbook.xlsx.writeBuffer();
}
