# Excel BOM Export

The toolbar's BOM action downloads a real `.xlsx` without uploading project data. ExcelJS is loaded only when export is requested. The adjacent settings action selects the active page or all pages in the active engineering project and configures wire reserve. Export preferences persist locally; each workbook also records its own parameters.

## Workbook

- **BOM summary:** consolidated devices, installed protection devices, placed terminal blocks, endpoint terminals, intermediate connectors, wire stock, finished cables and carriers.
- **Device detail:** one row per placed instance with page, custom name, device ID, physical dimensions and source.
- **Line detail:** one row per physical conductor; paired power and CAN circuits have two rows sharing a cable ID. Each carrier contributes one additional row.
- **Estimate parameters:** reserve, tail allowance, page calibration status and missing-data warnings. Excel formulas link the stock lengths and material totals to these parameters.

Quantity is based on placed instances, not physical serial numbers. Drawing the same actual device on multiple pages counts it multiple times. No chassis BOM item is invented from a background image.

## Counting Rules

- Device instances with the same definition and dimensions aggregate. Generic terminal blocks placed on the canvas are ordinary inventory items.
- Two-in/two-out inline terminal blocks are counted once per cable attachment, including blocks enclosed in conduit. They aggregate with the corresponding straight-through terminal block and do not create extra conductors or alter centerline lengths.
- Only configured fuse/breaker slots are counted. Packaging and incompatible ratings require review; empty slots are not inferred.
- Ferrules, ring terminals and fork terminals count once per conductor end. Intermediate single-pin crimps count both sides of every conductor.
- Multi-pin endpoint connectors count once per logical cable and physical connector, even when the companion conductor is stored in reverse.
- A shared intermediate connector counts as one assembly, not once for every member of a bundle. Pole count, mating halves and exact SKU must be confirmed from the hardware.
- Finished cable endpoint connectors are included in the finished cable, not added as separate purchases.
- Default terminal types are estimates based on the drawing's current defaults and are labeled accordingly. Explicit `none` contributes no terminal.
- Each drag chain or conduit is measured and counted once, irrespective of conductor count.

## Length Model

Lengths use the same centerline geometry and routing lanes as the canvas, including device port directions, waypoints, carrier trunks and exposed fan-out leads. View zoom is irrelevant. One world unit equals one millimeter.

Default wire stock is the planar route plus 15 percent reserve plus 100 mm at each A/B endpoint, rounded upward to 0.01 m. Users can change both allowances. Carrier lengths do not receive cable-tail allowances. Missing geometry stays unavailable, not zero; summaries explicitly identify incomplete estimates.

This is a planar planning estimate, not a final cutting schedule. It does not resolve 3D height differences, twist pitch, motion/service loops, intermediate-connector extra tails or tool-specific crimp lengths. Finished cable lengths must be mapped to actual purchasable lengths.

## Chassis Calibration

Enter the physical width represented by the entire background image, including any margins. Calibration scales image dimensions, device centers and routing controls around the image center. Physical device widths and heights do not change. This is a page-coordinate calibration, so it also transforms locked device positions while preserving their lock state. Existing electrical port IDs and connections remain unchanged.

Calibration is saved in source files. Uncalibrated images are reported as warnings in the workbook. Without an image, estimates use the existing millimeter-based diagram layout; users still need to place devices according to their actual robot layout.
