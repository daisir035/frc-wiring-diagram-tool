# FRC 接线图工具 · WireSheet

在浏览器中绘制 FRC 机器人接线图，管理多个工程与页面，导出 `.frcwire` 工程源文件、PNG 接线图和 Excel BOM。工程内容存储在当前浏览器的 IndexedDB 中，无需后端服务。

## 本地开发

建议使用 Node.js 24；本次验证环境为 Node.js 24.19.0。依赖版本由 `package-lock.json` 固定。

```sh
npm ci
npm run dev
```

```sh
npm test
npm run lint
npm run build
npm run preview
```

生产静态文件输出到 `dist/`。使用相对资源路径，部署到子目录时需将整个 `dist/` 挂载在该目录，并通过带末尾 `/` 的入口访问。

## Cloudflare 自动发布

推送到 `frc-main-backup-20260906` 分支后，GitHub Actions 会使用 Node.js 24 安装锁定依赖，依次运行测试、Lint 和生产构建，再将 `dist/` 发布到现有 Cloudflare Pages 项目 `frc-wiring-diagram-tool`。任一步骤失败都会停止发布，线上保留上一次成功部署。同一时间只保留最新的发布任务。

正式地址为 https://frcwiring.botscience.cn 和 https://wiring.botscience.cn。部署运行在 GitHub，不依赖本机开机；其他分支（包括 FTC 分支）不会触发这条 FRC 发布流水线。

发布配置位于 `.github/workflows/deploy-frc-pages.yml`，需要在 GitHub 仓库中配置：

- Actions secret：`CLOUDFLARE_PAGES_API_TOKEN`，具有目标账号的 Cloudflare Pages 编辑权限。
- Actions variable：`CLOUDFLARE_ACCOUNT_ID`，目标 Cloudflare 账号 ID。

Token 只放在 GitHub Secrets 中，不提交到源码。可在仓库的 Actions 页面查看 `Deploy FRC to Cloudflare Pages` 的执行记录、检查结果和部署日志。

## 使用与保存

- 从元件库添加器件，点击两个兼容端口连线。电源与 CAN 配对端口会按配置补全第二芯导线。
- 工程标签管理独立项目，页面标签管理同一工程中的多张图纸。“示例”会新建工程，保留现有内容。
- `Ctrl/Cmd+Z` 撤销，`Ctrl/Cmd+Shift+Z` 或 `Ctrl/Cmd+Y` 重做；一次拖动算一次操作。历史最多保留 80 步，刷新后清空。
- `Ctrl/Cmd+C/V` 复制粘贴选中内容，`Delete/Backspace` 删除，`R` 旋转。输入框和弹窗内不会触发画布快捷键。
- `Ctrl/Cmd+S` 下载当前工程及全部页面，`Ctrl/Cmd+O` 导入源文件。导入会新增工程，校验失败时保留现有工作区。
- 当前版本源文件为 `frc-wiresheet-source` v2，兼容 v1 工作区导入；一次导入最多 50 MiB。未知版本或损坏的引用会显示错误，不再静默丢弃元件或导线。

编辑结束后自动保存会短暂防抖，拖动过程中延后写入。请关注底栏的保存状态；保存失败时会显示错误、重试和下载备份入口。自动保存保留当前快照与上一份快照，读取失败时尝试恢复，并保留损坏原始数据。

第一次打开新版会迁移原 `localStorage` 存档，并保留旧数据。旧存档是迁移时的备份，不再跟随新版编辑更新；如需回退到旧版应用，请先导出当前工程源文件。存档与网址的 origin、浏览器和用户配置关联；更换域名或浏览器不会自动同步。请通过“保存源文件”保留独立备份，浏览器清理站点数据也会移除本地工程。

自定义器件可上传图片、标记端口并显式设置电源/CAN 配对。图片输入最多 10 MiB，最长边缩放至 2048 像素，并限制保存后的图片大小。仍被任意工程页面引用的自定义器件不能删除。

## BOM 与校验范围

Excel 导出模块按需加载。BOM 包含器件、线路、汇总和估算参数；现有工程中的端口不兼容、部分线规问题及直接连接 PDH/PDP 的保险丝问题会进入待核对项。

这些检查依据器件模型、端口类型和可识别的接口名称，尚不包含完整电路、电压域、电流负载或整车比赛合规校验。长度基于二维布线路径估算，安装高度、弯折、运动与实际施工余量仍需人工核对。详细口径见 [BOM 说明](docs/BOM_EXPORT.md)。

## 代码结构

| 位置 | 职责 |
| --- | --- |
| `src/pages/Home.tsx` | 工程、页面及编辑命令集成 |
| `src/components/WiringCanvas.tsx` | 画布渲染、选择、拖动与连接交互 |
| `src/lib/projectState.ts` | 存档模型、版本迁移、源文件校验 |
| `src/lib/workspaceStorage.ts` | IndexedDB、备份恢复、串行保存队列 |
| `src/hooks/useWorkspaceHistory.ts` | 编辑事务与撤销重做 |
| `src/lib/wiring.ts` | 端口规则、配对、布线几何 |
| `src/lib/bom.ts`、`src/lib/bomExcel.ts` | BOM 汇总、校验与 Excel 输出 |
| `tests/` | 数据、存储、历史、接线和 BOM 回归测试 |

可选几何性能比较（需本地 Git 历史中存在基准提交）：

```sh
node --experimental-strip-types scripts/benchmark-wiring.mjs 86835e0
```

脚本只读基准源码，先检查路径输出一致性，再比较 200/500 根单芯导线的合成场景。耗时不包含浏览器渲染和存储，不能直接换算为画布帧率。

本轮改动、性能数据与未覆盖范围见 [优化验证记录](docs/OPTIMIZATION_NOTES.md)。
