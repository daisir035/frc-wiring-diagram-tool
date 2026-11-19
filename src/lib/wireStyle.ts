/** Shared canvas and print line weight: 6 AWG heavy down to 28 AWG hairline. */
export function awgStrokeWidth(awg?: number) {
  if (!awg) return 1.8;
  return Math.max(1.1, Math.min(5.2, 0.0065 * (30 - awg) ** 2 + 1.1));
}
