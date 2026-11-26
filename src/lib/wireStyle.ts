/** Shared canvas and print line weight: 6 AWG heavy down to 28 AWG hairline. */
export function awgStrokeWidth(awg?: number) {
  if (!awg) return 1.8;
  return Math.max(1.1, Math.min(5.2, 0.0065 * (30 - awg) ** 2 + 1.1));
}

/**
 * Half the centre-to-centre spacing of a two-conductor cable: each conductor sits this far from
 * the cable's centre line. Part artwork that draws its own lead stubs uses it to meet the pair head-on.
 */
export function pairConductorSpacing(width: number, power: boolean) {
  // Power pairs need more breathing room while signal pairs remain compact.
  return width * 0.5 + (power ? Math.max(1, width * 0.3) : Math.max(0.8, width * 0.25));
}
