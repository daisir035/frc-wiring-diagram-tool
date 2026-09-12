# Inline Cable Connections

Select a power or CAN cable, choose a two-in/two-out terminal or solder joint, then select a point on that cable or its carrier. Terminals require a two-conductor cable; solder joints also support individual power/CAN conductors. Placement snaps to a straight section with enough clearance for the selected symbol. Double-clicking a wire no longer inserts a legacy waypoint terminal.

An inline connection is stored in `Wire.inlineConnectors` as an ID, optional `kind` and an A-to-B route fraction. Kind is `terminal2x2` or `solder`; older records without it remain terminals. It is an attachment, not a placed device, wire endpoint or routing waypoint. Original conductors, electrical endpoint IDs and route geometry remain unchanged. Moving an attachment preserves its kind.

Companion conductors share connector IDs. A reverse-oriented companion stores the mirrored fraction. Clipboard/page copies generate new connector IDs while preserving that pairing. File loading validates positions and preserves attachments.

Connections follow their cable through ordinary wiring, drag chains and conduit. Enclosed connections are hidden when the cable is unselected and have a compact editing marker when selected. Moving one back to exposed wire restores its symbol. Export omits editing indicators. BOM counts each terminal once, but solder joints once per conductor as welding work, not purchased terminal blocks.

Drag an existing connector along its cable to reposition it. A focused connector responds to Delete/Backspace without deleting the cable; the properties panel also offers individual and bulk removal. Escape cancels placement. Data cables and unpaired single conductors do not accept a two-conductor block.

Inline symbols are deliberately compact: terminals are 24 x 12 drawing units and solder joints 10 x 8, with placement clearances of 26 and 16 respectively. These are annotation sizes, not new manufacturer footprint claims; standalone terminal devices retain their existing dimensions. A connection cannot be newly placed when no straight segment can contain it. If later rerouting eliminates all suitable straight segments, it is retained and its tooltip identifies the insufficient space.

## Conductor Colors

Compound port symbols split their colors along the actual positive/negative or CAN-H/CAN-L pin axis, including device rotation and measured dimensions. Parallel cable order is chosen from that axis; only the short exposed tails blend toward an incompatible far-end pin order. Both sides of a PDH therefore connect red to the positive half and black to the negative half. Protection sleeves and inline symbols retain the same conductor order along the route.

Legacy waypoint terminals remain readable and editable for existing drawings, but their old creation action is removed. The independent 2-to-4 device and its branching behavior are unchanged.
