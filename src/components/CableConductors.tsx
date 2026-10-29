import { useMemo } from 'react';
import { cableConductorPaths } from '../lib/cableGeometry';
import type { CableEndAlignment } from '../lib/cableGeometry';
import type { RoutePoint } from '../lib/wiring';

/** `width` is each conductor's stroke; `flat` drops the white halo for print. */
export default function CableConductors({ points, colors, twisted, startAxis, endAxis, polarity, radius = 8, width = 2.8, flat = false }: {
  points: RoutePoint[]; colors: [string, string]; twisted: boolean; radius?: number; width?: number; flat?: boolean;
} & CableEndAlignment) {
  // Adjacent conductors with a hairline gap, like a bonded pair.
  const spacing = flat ? width * 0.68 : 2.6;
  const geometry = useMemo(() => cableConductorPaths(points, twisted, { startAxis, endAxis, polarity }, radius, spacing),
    [points, twisted, startAxis, endAxis, polarity, radius, spacing]);
  return (
    <g data-cable-style={twisted ? 'twisted' : 'parallel'} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {!flat && geometry.paths.map((path, index) => <path key={`outline-${index}`} d={path} stroke="#fff" strokeWidth={width + 1.8} />)}
      {geometry.paths.map((path, index) => <path key={index} data-conductor-index={index} d={path} stroke={colors[index]} strokeWidth={width} />)}
      {geometry.crossings.map((crossing, index) => (
        <path key={index} d={crossing.path} stroke={colors[crossing.conductor]} strokeWidth={width} />
      ))}
    </g>
  );
}
