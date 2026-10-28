# Pneumatics and routing implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 支持自由拖拽、固定点、圆角、AndyMark 气缸及完整气动系统制图。
**Architecture:** 扩展现有 SVG 路由、元件定义和工程存储，共享几何用于显示、命中和导出。不添加画布依赖。
**Tech Stack:** React 19, TypeScript 5.9, Vite 7, node:test.
**Spec:** `docs/superpowers/specs/2026-10-28-pneumatics-routing-design.md`

## Global Constraints

- 基于 frc-main-backup-20260906；兼容旧工程。
- 气缸尺寸只使用可核对 AndyMark 数据；优先提取 PDF 元件素材。
- 气路不能应用 AWG、电气端子或与电口连接。

## Review Focus

- 旧路径点未带类型时不得丢失原端子语义（任务 1）。
- 零长段、折返、超大圆角不得生成无效路径（任务 1）。
- 锁定点在移动器件时保持位置，复制时随副本移动（任务 2）。
- 拆束或反向成员不得交换入口/出口或丢失路径（任务 2）。
- 气缸换型后连线仍挂在正确端口，气管在 BOM 中单列（任务 3）。

## Task 1: 路由数据与几何

Files: `src/lib/wiring.ts`, `src/lib/projectState.ts`, `tests/wiring.test.mjs`, `tests/project-state.test.mjs`.
- [x] 先添加失败用例：旧点默认端子、新点纯几何、字段往返、重复点和折返及超大半径保持有限坐标。
- [x] 扩展 Wire 路径模式与圆角半径，WireWaypoint 几何类型与锁定字段，导入限制非法数值。
- [x] 增加自由折线路由，复用圆角函数；保持旧字段默认行为。
- [x] 运行 `npm test` 并确认上述用例通过。

## Task 2: 画布交互与线束

Files: `src/components/WiringCanvas.tsx`, `src/components/WirePropertiesPanel.tsx`, `src/components/WireBundlePanel.tsx`, `src/pages/Home.tsx`, `src/lib/cableGeometry.ts`, `src/lib/canvasHitTesting.ts`.
- [x] 为锁点移动/复制、反向线束成员、拆束路径保留添加失败用例。
- [x] 增加路径模式、半径和固定点编辑；自由拖拽取消强制网格吸附；纯路径点不渲染电气端子。
- [x] 主干编辑同步全束，保持成员引入/引出段；拖动历史合为一次操作。
- [x] 验证命中、端子定位、撤销重做和导出几何一致，运行 `npm test`。

## Task 3: 气动模型、元件与气缸

Files: `src/lib/wiring.ts`, `src/lib/projectState.ts`, `src/lib/bom.ts`, `src/components/PropertiesPanel.tsx`, `src/components/WirePropertiesPanel.tsx`, `src/components/PartArtwork.tsx`, `public/parts/`, `docs/PART_DIMENSIONS.md`.
- [x] 核对 AndyMark 产品 SKU、缸径、行程、收缩总长、外径和尺寸图，记录来源。
- [x] 为气电误接、气管无 AWG、气缸换型端口稳定、BOM 分类添加失败用例。
- [x] 新增独立气口与气管属性、完整气动元件目录、PH/PCM 端口和有来源的气缸型号选择器。
- [x] 提取 PDF 元件素材，检查透明背景及端口位置，缺图补绘并登记来源。
- [x] 保存/加载/复制保留气缸型号及气管参数，运行 `npm test`。

## Task 4: 完整示例与交付验证

Files: 示例工程放在现有 public 资源目录，操作说明放在 docs。
- [x] 创建高压侧、工作侧、PH/PCM 电气控制与气缸完整示例，并验证可加载。
- [x] 运行 `npm test`, `npm run build`, `npm run lint`；区分已有问题和本次新增问题。
- [x] 浏览器检查拖动、锁点、圆角、气缸切换、撤销、保存加载及材料表导出。
- [x] 审查 diff，报告具体完成项、验证证据和未解决限制。
