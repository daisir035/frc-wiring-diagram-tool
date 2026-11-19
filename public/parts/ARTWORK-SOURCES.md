# FRC component artwork

The built-in library uses vector drawings throughout. PNG and other original reference images remain in this directory for comparison; built-in component and fuse definitions no longer reference them.

## Team 3161 / Stefen Acepcion

The following SVGs are from [Stefen Acepcion's FRC Control System Diagrams, V3.30](https://github.com/stefacep/FRC-Control-System-Diagrams/tree/061de1d/Individual%20Components/SVG), designed with Team 3161. They are used under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Logos remain the property of their respective owners. This application is not endorsed by the authors.

- RoboRIO 2.0, VRM, VH-109 Radio, RSL, 120A Fuse
- Falcon 500, Kraken X44, Kraken X60
- 2168 Type Beam Break, NPN Photoelectric Sensor, LM Switch, Potentiometer, TTB Analog Encoder
- C270 Camera, WS2812B Strip
- PDH (No Fuses), 10A Automotive Fuse, 10A PDH Fuse, 20A PDH Fuse, 40A PDH Fuse

Retrieved 2026-11-16. The source revision is pinned to the 2025 V3.30 release rather than the moving main branch. RSL.svg's viewport was cropped from `0 0 185.49 153.66` to `0 21.3 185.49 109.21`, preserving the source paths. The overlaid red La–Lb jumper and middle N return terminal follow the [WPILib RSL wiring instructions](https://docs.wpilib.org/en/stable/docs/zero-to-robot/step-1/intro-to-frc-robot-wiring.html#robot-signal-light). All other files preserve the supplied drawings.

Design reference: [2025 FRC Control System Diagrams](https://wiki.team3161.ca/books/branding-implementation-examples/page/2025-frc-control-system-diagrams).

## Original vector redraws

These SVG files were drawn specifically for this application with transparent backgrounds, flat fills and orthographic views. They preserve the previous component coordinate systems, port IDs, channel IDs, fuse slots, saved-project dimensions and view variants. They are diagram illustrations, not manufacturer CAD.

| Drawing | Reference |
| --- | --- |
| CTRE PDP 2.0 Diagram.svg | [CTRE PDP 2.0](https://store.ctr-electronics.com/products/pdp-2); existing `CTRE PDP 2.0 Top.png` and its `.source.txt`. All 24 channels and breaker bays retain their original normalized coordinates. |
| REV Mini Power Module Diagram.svg | [REV-11-1956](https://www.revrobotics.com/rev-11-1956/); existing top-view image and its `.source.txt`. Channels 5–0 remain top to bottom; power input remains on the bottom. |
| CTRE Pigeon 2.0 Diagram.svg | [CTRE Pigeon 2.0](https://store.ctr-electronics.com/products/pigeon-2); existing `CTRE Pigeon 2.0.png` and `.source.txt`. The clear housing, asymmetric label cut-outs, diagonal mounting bosses and axis legend are redrawn in a flat style. |
| CANivore Diagram.svg | [CTRE CANivore](https://store.ctr-electronics.com/products/canivore); existing `CANivore.png` and `.source.txt`. Redrawn from that top view: blue-gray bezel, black face notched around the two diagonal mounting holes, four status LEDs and the protruding four-position connector labelled VBAT+ (R), VBAT− (B), CAN H (Y), CAN L (G). USB and power/CAN port coordinates remain unchanged. |

Existing parameterized pneumatic drawings and the motor top views, Limelight, CANcoder and battery vector drawings remain SVG rendered by React. Pneumatic ports continue to be generated from the same fitting, valve and cylinder geometry used by their artwork.

The battery illustration depicts the light-gray case, molded gray lid and compact monochrome MK mark of the MK ES17-12. References: [REV's MK ES17-12 product](https://www.revrobotics.com/rev-19-2487/) and the [MK manufacturer datasheet supplied by AndyMark](https://s3.amazonaws.com/docusync-files/cacc1eb873bfa1d6bda7b8a738560a16992dd936cd4f6e119a512326d85e2759/am-0844%20ES17-12%20User%20Guide.pdf). This is a simplified diagram illustration, retaining the existing 181 × 76 mm footprint and adjustable size. Its two right-edge connection anchors preserve saved wiring; they are schematic connection locations, not the physical bolt-terminal positions. Only MK and 12V 18Ah identify the product on the illustration; no manufacturer label artwork is embedded.

The MPM drawing contains six empty ATM sockets. Installed fuses are rendered by the existing interactive fuse layer, with channels 5–0 top to bottom and 5 / 10 / 15 A options. The [REV product specification](https://www.revrobotics.com/rev-11-1956/) lists a 15 A limit per output, 40 A total and the supplied 5 / 10 / 15 A ATM fuses. [REV's connector specifications](https://docs.revrobotics.com/ion-control/mpm/specs) distinguish bare-wire and ferrule ranges; the MPM branch recommendation uses 18 AWG, with 16 AWG available for bare-wire termination. Fuse ratings do not represent actual load current, so the diagram does not sum fitted fuse ratings to infer the 40 A operating limit.

## Terminal drawings and scale

One world unit is one millimeter. `partDimensions` remains the source of truth for placed components and preserves instance-level measured-size overrides. Standalone terminal drawing coordinates now use the same 40 × 22 mm and 48 × 26 mm reference envelopes as the model, rather than oversized illustration canvases. The inline two-to-two terminal retains its compact 24 × 12 mm envelope and routing clearance.

The terminal blocks have no unique manufacturer SKU. Their sizes therefore remain **reference**, never **verified**. Orange lever and translucent housing details depict the connector family, not a certified product or current rating. The two-to-four drawing depicts two independent electrical potentials: its centre window shows the red and black busbars, so the alternating + − + − outputs can be traced back to their input. Every socket carries its own polarity mark. The illustration does not replace the actual product's continuity diagram.

`WireTerminalMarker` draws representative footprints per connector family: ferrule 12 × 3.4, ring 19 × 7.6, fork 18 × 8, Powerpole-style pair 25 × 15.8, lever connector 19 × 13, PWM 12 × 7.6, JST 7 × 6, RJ45 22 × 11.7, and USB-A 24 × 12.8 mm. These are schematic reference envelopes. A generic selector such as “USB” or “JST / Molex” does not identify a specific physical connector; use the exact hardware dimensions for fabrication or clearance checks.
