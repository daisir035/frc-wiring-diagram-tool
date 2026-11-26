import { useMemo } from 'react';
import { cableConductorPaths } from '../lib/cableGeometry';
import type { CableEndAlignment } from '../lib/cableGeometry';
import type { RoutePoint } from '../lib/wiring';
import { pairConductorSpacing } from '../lib/wireStyle';

/** `width` is each conductor's stroke; `flat` drops the white halo for print. */
export default function CableConductors({ points, colors, twisted, startAxis, endAxis, startOffset, endOffset, polarity, radius = 8, width = 2.8, flat = false, power = false }: {
  points: RoutePoint[]; colors: [string, string]; twisted: boolean; radius?: number; width?: number; flat?: boolean; power?: boolean;
} & CableEndAlignment) {
  const spacing = pairConductorSpacing(width, power);
  const geometry = useMemo(() => cableConductorPaths(points, twisted, { startAxis, endAxis, startOffset, endOffset, polarity }, radius, spacing),
    [points, twisted, startAxis, endAxis, startOffset, endOffset, polarity, radius, spacing]);
  return (
    <g data-cable-style={twisted ? 'twisted' : 'parallel'} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* Flat ends: a round white cap would notch into the part's own lead stub where the cable lands. */}
      {!flat && geometry.paths.map((path, index) => <path key={`outline-${index}`} d={path} stroke="#fff" strokeWidth={width + 1} strokeLinecap="butt" />)}
      {geometry.paths.map((path, index) => <path key={index} data-conductor-index={index} d={path} stroke={colors[index]} strokeWidth={width} />)}
      {geometry.crossings.map((crossing, index) => (
        <path key={index} d={crossing.path} stroke={colors[crossing.conductor]} strokeWidth={width} />
      ))}
    </g>
  );
}
