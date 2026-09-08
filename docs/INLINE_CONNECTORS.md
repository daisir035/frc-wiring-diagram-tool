# Inline 2-to-2 Connectors

Select a paired power or CAN cable, choose the 2-to-2 insertion action, then select a point on that cable or its carrier. Placement snaps to a straight section with enough clearance for the terminal body. Double-clicking a wire no longer inserts a legacy waypoint terminal.

An inline connector is stored in `Wire.inlineConnectors` as an ID and an A-to-B route fraction. It is an attachment, not a placed device, wire endpoint or routing waypoint. The two original conductors, electrical endpoint IDs and route geometry remain unchanged.

Companion conductors share connector IDs. A reverse-oriented companion stores the mirrored fraction. Clipboard/page copies generate new connector IDs while preserving that pairing. File loading validates positions and preserves attachments.

Connectors follow their cable through ordinary wiring, drag chains and conduit. Enclosed connectors are hidden when the cable is unselected and have a compact editing marker when selected. Moving the connector back to exposed wire restores the full artwork. Export omits editing indicators; BOM counts both exposed and enclosed connectors once.

Drag an existing connector along its cable to reposition it. A focused connector responds to Delete/Backspace without deleting the cable; the properties panel also offers individual and bulk removal. Escape cancels placement. Data cables and unpaired single conductors do not accept a two-conductor block.

The generic straight-through block supplies the artwork and reference dimensions. A connector cannot be newly placed when no straight segment can contain it. If later rerouting eliminates all suitable straight segments, the connector is retained and its tooltip identifies the insufficient space.

Legacy waypoint terminals remain readable and editable for existing drawings, but their old creation action is removed. The independent 2-to-4 device and its branching behavior are unchanged.
