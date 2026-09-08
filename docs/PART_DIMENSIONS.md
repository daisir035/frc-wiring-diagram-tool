# Part Dimensions

Checked on 2026-09-08. Canvas geometry uses one world unit per millimeter. Zoom changes screen pixels only; a 100% view is not a physical print-size guarantee.

Dimensions are the unrotated artwork footprint, width by height. They do not include service clearances or loose wires. Limelight uses the lens-facing projection; other images may use a top or side projection. This remains a wiring diagram, not a mechanical mounting CAD model.

## Verified Defaults

| Part | Width (mm) | Height (mm) | Source |
| --- | ---: | ---: | --- |
| roboRIO 2.0 | 146 | 143 | [NI specifications](https://www.ni.com/docs/en-US/bundle/roborio-20-specs/page/specs.html), Physical Characteristics: 14.6 x 14.3 x 3.5 cm |
| CTRE PDP 2.0 | 103.632 | 233.934 | [CTRE product page](https://store.ctr-electronics.com/products/pdp-2), 4.08 x 9.21 in |
| REV PDH | 111.125 | 225.425 | [REV-11-1850](https://www.revrobotics.com/rev-11-1850/), 4.375 x 8.875 in |
| miniPDH / REV Mini Power Module | 47.625 | 85.725 | [REV-11-1956](https://www.revrobotics.com/rev-11-1956/), 1.875 x 3.375 in |
| VRM | 51.562 | 56.388 | [CTRE manual](https://ctre.download/files/user-manual/VRM%20User%27s%20Guide.pdf), page 6, 2.030 x 2.220 in |
| Limelight 3 | 80.61 | 49.01 | [Manufacturer specifications](https://docs.limelightvision.io/docs/docs-limelight/getting-started/limelight-3) and local `public/parts/Limelight 3 Drawing.png` |
| Limelight 4 | 80.11 | 48.11 | [Manufacturer specifications](https://docs.limelightvision.io/docs/docs-limelight/getting-started/limelight-4) and local `public/parts/Limelight 4 Drawing.png` |
| CANivore | 55.12 | 39.37 | [CTRE manual](https://ctre.download/files/user-manual/CANivore%20User%27s%20Guide.pdf), retained from the earlier verified definition |

Limelight 3: USB-A and Ethernet leave the bottom edge; power leaves the right edge. Limelight 4: Ethernet leaves the bottom, USB-C the top, power the right. Port coordinates are schematic projections of the mechanical drawings, not machining coordinates.

## Reference And Measured Dimensions

Other built-in defaults remain explicitly labeled reference dimensions until the exact variant and its drawing have been checked. Generic terminals have no unique manufacturer or SKU; their lever-terminal artwork is a generic schematic, not a claim about a specific product. Motor-side silhouettes may include shafts, and LED strips have configurable lengths.

Each placed device accepts a measured width and height in millimeters. These values override its library default, persist in project files, and apply consistently to ports, rotation, selection, fit-to-view and PNG export. Reset restores the library default. Locked parts cannot be resized.

The stable internal ID `miniPdp` is retained for miniPDH so existing projects keep `batt+`, `batt-` and all six channel pairs. Only the library model, default footprint, artwork and physical port locations change. Existing instance names and explicit measured sizes are not discarded.
