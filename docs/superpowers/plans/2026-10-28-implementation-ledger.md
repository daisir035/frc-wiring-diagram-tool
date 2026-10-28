# Implementation ledger

Base: frc-main-backup-20260906; implementation branch feat/pneumatics-free-routing.
Baseline: npm test → 140 passing.
Pre-flight: Tasks 1/2 share Wire and waypoint fields; tasks 3/4 share builtin IDs and source-file parser.
Task 1/2: free-route and locked-coordinate tests RED→GREEN; persistence validation and paired-conductor radius tests covered. Old waypoint terminal semantics retained.
Task 3: pneumatic connection/BOM/catalog tests RED→GREEN. Full suite 149 passing before detach regression (now added and passing).
Ruling: use the existing task-specific clone and a feature branch rather than another checkout; no shared user work is present.
Ruling: 12 mm compact cylinder has verified bore/stroke only. Its external footprint is explicitly reference-sized because AndyMark does not publish it. Five 19.05 mm bore variants have published retracted lengths and outer diameter.
Ruling: prepared image assets through image editing using PDF originals; artwork is not claimed to be pixel-identical extraction. Cylinder SVG is dimension-aware.
Ruling: existing all-port compatibility test assumed every same-type port can connect. Adjusted expectation for newly introduced exhaust ports, which must vent to atmosphere.
Task 4: full sample created and browser-loaded with zero page errors. Browser interaction checks and final review in progress.

Final review: independent reviewer identified member-lead fallback, style-switch lead overwrite, detached legacy terminal loss, rounded section-join mismatch and lead terminal BOM ownership. All addressed with RED→GREEN regressions; style switch also verified in browser.
Browser: free mode/radius, locked guide, tube properties, saved source, cylinder SKU switch, preserved A/B connections and PNG download passed with no page errors. Bundle test passed independent lead preservation, lock blocking drag, free member drag and one-step undo.
Ruling: preserve sharp section junctions with an internal per-point radius override when removing jackets. This keeps rendered geometry and BOM sampling consistent instead of changing the route during detach.
Ruling: PH/PCM generated cutouts altered product markings, so retained authentic PDF images and cropped PH through an SVG viewport.
No deferred reviewer findings.

Final verification: npm test 156/156 passing; npm run lint clean; npm run build successful (existing large-chunk warning remains).
