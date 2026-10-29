# 气动系统与自由路径

工具栏「气动示例」会打开一个独立工程，它按 FIRST Pneumatics Manual（Rev. Jan 2023）的 Figure 1（高压侧）和 Figure 2（工作侧）布局，并加上 REV Pneumatic Hub 的电气控制。示例由 `scripts/build-pneumatics-example.mjs` 生成：

```
node --experimental-strip-types scripts/build-pneumatics-example.mjs
```

## 走线路径

在导线、气管或线束面板的「走线路径」里选择模式：

| 模式 | 行为 |
|---|---|
| 正交 | 自动横平竖直，拐角按「拐角圆弧」半径过渡，拖动吸附 4 mm 网格 |
| 折线 | 按固定点直线相连，拐角圆弧过渡，拖动不吸附 |
| 曲线 | 三次样条穿过所有固定点；两端沿接口法线伸出，效果同手册里的气管。新建气管默认使用 |

- 折线和曲线模式下，按住线身直接拖动就会在按下处插入固定点并跟随鼠标，整个过程撤销一次即可还原。
- 双击线路，或在面板点「加固定点」，也可以加点。拖动空心圈调整位置，双击删除。
- 固定点可以锁定：锁定后不能拖动，移动两端器件时位置也不变；整体复制时随副本平移。
- 线束主干同样支持这三种模式。成员的引入/引出段在曲线模式下也是样条。合并线束时只要求中间端子一致，固定点不同不会阻止合并，主干沿用参考导线的固定点。

固定点是纯几何点，不算接插件，也不进材料表。旧工程里没有标类型的路径点仍按中间端子处理。

## 气动元件

元件图直接从手册 PDF 内嵌的插图（第 4 页 Figure 1、第 5 页 Figure 2）抠出，去掉白底和气管，存放在 `public/parts/pneumatics/`。按每个源像素 0.6 mm 绘制，属于参考外形，可在属性面板按实物校准。

压缩机、储气罐、主调压阀（带压力表）、压力表、压力开关（三通座）、安全阀、手动泄压阀、单电磁阀、双电磁阀、阀岛电磁阀、三通接头；外加 REV PH 和 CTRE PCM（手册第 6/7 页产品图）。

- 气口画在图中推入式接头的红圈处。已连接的气口不显示圆点；未连接的显示绿色空心圈。两个气口重合（硬接头直接拧在一起）也视为已连接。
- 气口只能连气口，每个接口只接一根管；分支要用三通。排气口不能互接。
- 气管按管外径绘制粗细，可选 4 mm、1/4 in、3/8 in，并可标注高压侧或工作侧。材料表单列气管（外径、压力侧、长度），不计 AWG 和端子；长度按平面中心线估算。

## AndyMark 气缸

属性面板先选缸径，再选行程。端口 A/B 的 id 不随型号变化，换型后连接保留；换到单口型号时，挂在已不存在端口上的连线会被移除。

| 型号 | 缸径 | 行程 | 收缩总长 | 来源 |
|---|---|---|---|---|
| am-2034_05 | 3/4 in | 0.5 in | 5.1 in | AndyMark 产品页 |
| am-2034_2 | 3/4 in | 2 in | 6.5 in | 同上 |
| am-2034_4 | 3/4 in | 4 in | 8.5 in | 同上 |
| am-2034_6 | 3/4 in | 6 in | 10.5 in | 同上 |
| am-2034_7 | 3/4 in | 7 in | 11.5 in | 同上 |
| am-4229 Bimba 040.5-R | 3/4 in | 0.5 in | 4.25 in 缸体 + 15 mm 杆（参考） | AndyMark 产品页，弹簧伸出、单口 |
| am-4388 | 12 mm | 10 mm | 40 mm（参考） | AndyMark 产品页只给缸径与行程 |

- am-4229 的产品标题写「Spring Extend」，规格栏却写「Style: Double Acting」，两处矛盾。这里按标题画成单口，买之前请核对实物。
- SMC 缸体外径用 0.86 in（AndyMark 页面所链 SMC 图纸中的 ØE）。
- 气缸按手册 actuator 的样式矢量绘制：灰色缸体、两端端盖、活塞杆，端盖上叠加从手册抠出的弯头接头。图形长度等于收缩总长，所以换行程时外形会按真实尺寸变化。
- 外露杆长和非 SMC 型号的外形为参考值，面板中会标「参考」。

资料来源：
- https://andymark.com/products/double-acting-3-4-in-bore-air-cylinders-different-lengths
- https://andymark.com/products/0-75-in-bore-0-50-in-stroke-spring-extend-bimba-air-cylinder-040-5-r
- https://andymark.com/products/12-mm-bore-10-mm-stroke-air-cylinder
- https://www.firstinspires.org/sites/default/files/uploads/resource_library/frc/technical-resources/frc_pneumatics_manual.pdf

示例只作制图参考，不做气动仿真、额定压力校验或赛季规则认证。
